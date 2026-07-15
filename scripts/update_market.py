#!/usr/bin/env python3
"""End-of-day portfolio data updater.

Runs in two modes at once:
1) Static fallback: reads setup/my-holdings.csv and writes data/*.json.
2) Cloud mode: when Supabase service credentials exist, reads each user's
   instruments and upserts protected snapshots/results/announcements.

The program is deliberately defensive: one bad or unmapped ticker does not
stop the rest of the portfolio from updating.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd
import requests
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
SETUP_CSV = ROOT / "setup" / "symbols.csv"
DATA_DIR = ROOT / "data"
USER_AGENT = "PortfolioCommandCenter/1.0 (+personal research dashboard)"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_number(value: Any) -> float | None:
    try:
        n = float(value)
        if math.isnan(n) or math.isinf(n):
            return None
        return round(n, 6)
    except (TypeError, ValueError):
        return None


def jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return clean_number(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    return value


@dataclass(frozen=True)
class Instrument:
    user_id: str | None
    symbol: str
    yahoo_symbol: str
    name: str


def base_symbol(symbol: str) -> str:
    return re.sub(r"-(BE|SM|BZ|BL)$", "", symbol.strip().upper())


def load_static_instruments() -> list[Instrument]:
    if not SETUP_CSV.exists():
        return []
    instruments: list[Instrument] = []
    with SETUP_CSV.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            symbol = (row.get("symbol") or row.get("Instrument") or row.get("Symbol") or "").strip().upper()
            if not symbol:
                continue
            yahoo_symbol = (row.get("yahoo_symbol") or f"{base_symbol(symbol)}.NS").strip().upper()
            name = (row.get("name") or symbol).strip()
            instruments.append(Instrument(None, symbol, yahoo_symbol, name))
    return instruments


class SupabaseREST:
    def __init__(self) -> None:
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.enabled = bool(self.url and self.key)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            }
        )

    def _endpoint(self, table: str) -> str:
        return f"{self.url}/rest/v1/{table}"

    def get(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        response = self.session.get(self._endpoint(table), params=params, timeout=45)
        response.raise_for_status()
        return response.json()

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
        if not self.enabled or not rows:
            return
        headers = {"Prefer": "resolution=merge-duplicates,return=minimal"}
        response = self.session.post(
            self._endpoint(table),
            params={"on_conflict": on_conflict},
            headers=headers,
            data=json.dumps(rows, default=jsonable),
            timeout=90,
        )
        if response.status_code >= 300:
            raise RuntimeError(f"Supabase upsert {table} failed: {response.status_code} {response.text[:800]}")

    def instruments(self) -> list[Instrument]:
        rows = self.get(
            "instruments",
            {"select": "user_id,symbol,yahoo_symbol,name", "active": "eq.true", "order": "user_id,symbol"},
        )
        return [
            Instrument(r["user_id"], r["symbol"], r.get("yahoo_symbol") or f"{base_symbol(r['symbol'])}.NS", r.get("name") or r["symbol"])
            for r in rows
        ]

    def existing_announcement_ids(self) -> set[tuple[str, str]]:
        rows = self.get(
            "announcements",
            {"select": "user_id,external_id", "is_manual": "eq.false", "external_id": "not.is.null"},
        )
        return {(r["user_id"], r["external_id"]) for r in rows if r.get("external_id")}


def history_for(ticker: str, period: str = "2y") -> pd.DataFrame:
    try:
        frame = yf.Ticker(ticker).history(period=period, interval="1d", auto_adjust=True, actions=False, repair=True)
        if frame is None:
            return pd.DataFrame()
        frame = frame.dropna(how="all")
        return frame
    except Exception as exc:  # noqa: BLE001
        print(f"  history failed for {ticker}: {exc}")
        return pd.DataFrame()


def search_yahoo_symbol(query: str) -> tuple[str | None, str | None]:
    try:
        search = yf.Search(query, max_results=10, news_count=0)
        quotes = getattr(search, "quotes", []) or []
        candidates = []
        for q in quotes:
            symbol = q.get("symbol")
            exchange = str(q.get("exchange") or q.get("exchDisp") or "").upper()
            quote_type = str(q.get("quoteType") or "").upper()
            if not symbol or quote_type not in {"EQUITY", "ETF"}:
                continue
            score = 0
            if symbol.endswith(".NS"):
                score += 5
            if symbol.endswith(".BO"):
                score += 3
            if exchange in {"NSI", "NSE", "BSE", "BOM"}:
                score += 2
            if base_symbol(query) in symbol.upper():
                score += 2
            candidates.append((score, symbol, q.get("longname") or q.get("shortname")))
        if not candidates:
            return None, None
        _, symbol, name = max(candidates, key=lambda x: x[0])
        return symbol, name
    except Exception as exc:  # noqa: BLE001
        print(f"  symbol search failed for {query}: {exc}")
        return None, None


def resolve(instrument: Instrument) -> tuple[str, str, pd.DataFrame]:
    tried: list[str] = []
    for candidate in [instrument.yahoo_symbol, f"{base_symbol(instrument.symbol)}.NS", f"{base_symbol(instrument.symbol)}.BO"]:
        if not candidate or candidate in tried:
            continue
        tried.append(candidate)
        frame = history_for(candidate)
        if len(frame) >= 20:
            return candidate, instrument.name, frame
    found, name = search_yahoo_symbol(instrument.name if instrument.name != instrument.symbol else base_symbol(instrument.symbol))
    if found and found not in tried:
        frame = history_for(found)
        if len(frame) >= 20:
            return found, name or instrument.name, frame
    return instrument.yahoo_symbol, instrument.name, pd.DataFrame()


def calculate_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.mask((loss == 0) & (gain > 0), 100.0)
    rsi = rsi.mask((gain == 0) & (loss > 0), 0.0)
    rsi = rsi.mask((gain == 0) & (loss == 0), 50.0)
    return rsi


def technical_snapshot(instrument: Instrument, yahoo_symbol: str, frame: pd.DataFrame) -> dict[str, Any]:
    if frame is None or frame.empty or "Close" not in frame.columns:
        close = pd.Series(dtype="float64")
        volume = pd.Series(dtype="float64")
    else:
        close = pd.to_numeric(frame["Close"], errors="coerce").dropna()

        if "Volume" in frame.columns:
            volume = (
                pd.to_numeric(frame["Volume"], errors="coerce")
                .reindex(close.index)
                .fillna(0)
            )
        else:
            volume = pd.Series(0.0, index=close.index)
    if len(close) < 20:
        return {
            "user_id": instrument.user_id,
            "symbol": instrument.symbol,
            "yahoo_symbol": yahoo_symbol,
            "as_of": datetime.now().date().isoformat(),
            "trend_score": 0,
            "trend_label": "Data unavailable",
            "alerts": ["No reliable price history for mapped symbol"],
            "source": "Yahoo Finance via yfinance",
            "fetched_at": now_iso(),
        }

    sma20 = close.rolling(20).mean()
    sma50 = close.rolling(50).mean()
    sma200 = close.rolling(200).mean()
    ema20 = close.ewm(span=20, adjust=False).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()
    rsi = calculate_rsi(close)
    avg_vol20 = volume.rolling(20).mean()

    c = float(close.iloc[-1])
    prev = float(close.iloc[-2]) if len(close) > 1 else c
    daily_change = ((c / prev) - 1) * 100 if prev else None
    s20, s50, s200 = sma20.iloc[-1], sma50.iloc[-1], sma200.iloc[-1]
    e20, e50, r14 = ema20.iloc[-1], ema50.iloc[-1], rsi.iloc[-1]
    v, av = volume.iloc[-1], avg_vol20.iloc[-1]
    volume_ratio = (v / av) if av and not pd.isna(av) else None
    window = close.tail(252)
    high_52w, low_52w = float(window.max()), float(window.min())
    prior_window = close.iloc[max(0, len(close) - 253) : -1]
    prior_high = float(prior_window.max()) if len(prior_window) else high_52w
    prior_low = float(prior_window.min()) if len(prior_window) else low_52w

    score = 0
    if not pd.isna(s20):
        score += 1 if c > s20 else -1
    if not pd.isna(s50):
        score += 1 if c > s50 else -1
    if not pd.isna(s200):
        score += 2 if c > s200 else -2
    if not pd.isna(e20) and not pd.isna(e50):
        score += 1 if e20 > e50 else -1
    if not pd.isna(r14):
        if 50 <= r14 <= 70:
            score += 1
        elif r14 < 40:
            score -= 1
    if prior_high and c > prior_high * 1.002:
        score += 2
    if prior_low and c < prior_low * 0.998:
        score -= 2

    if score >= 6:
        label = "Strong bullish"
    elif score >= 2:
        label = "Bullish"
    elif score <= -6:
        label = "Strong bearish"
    elif score <= -2:
        label = "Bearish"
    else:
        label = "Neutral / watch"

    alerts: list[str] = []
    if not pd.isna(s200) and c < s200:
        alerts.append("Price below 200 DMA")
    if not pd.isna(s50) and c < s50:
        alerts.append("Price below 50 DMA")
    if len(close) > 2 and len(sma50.dropna()) > 1 and len(sma200.dropna()) > 1:
        if sma50.iloc[-2] <= sma200.iloc[-2] and sma50.iloc[-1] > sma200.iloc[-1]:
            alerts.append("Golden cross: 50 DMA crossed above 200 DMA")
        if sma50.iloc[-2] >= sma200.iloc[-2] and sma50.iloc[-1] < sma200.iloc[-1]:
            alerts.append("Death cross: 50 DMA crossed below 200 DMA")
    if prior_high and c > prior_high * 1.002:
        alerts.append("52-week breakout")
    elif high_52w and c >= high_52w * 0.98:
        alerts.append("Within 2% of 52-week high")
    if prior_low and c < prior_low * 0.998:
        alerts.append("52-week breakdown")
    if volume_ratio and volume_ratio >= 1.8:
        alerts.append(f"High volume: {volume_ratio:.1f}× 20-day average")
    if not pd.isna(r14) and r14 >= 75:
        alerts.append("RSI above 75: overbought risk")
    if not pd.isna(r14) and r14 <= 30:
        alerts.append("RSI below 30: oversold condition")

    return {
        "user_id": instrument.user_id,
        "symbol": instrument.symbol,
        "yahoo_symbol": yahoo_symbol,
        "as_of": close.index[-1].date().isoformat(),
        "close": clean_number(c),
        "daily_change_pct": clean_number(daily_change),
        "sma20": clean_number(s20),
        "sma50": clean_number(s50),
        "sma200": clean_number(s200),
        "ema20": clean_number(e20),
        "ema50": clean_number(e50),
        "rsi14": clean_number(r14),
        "high_52w": clean_number(high_52w),
        "low_52w": clean_number(low_52w),
        "volume": clean_number(v),
        "avg_volume20": clean_number(av),
        "volume_ratio": clean_number(volume_ratio),
        "trend_score": int(score),
        "trend_label": label,
        "alerts": alerts,
        "source": "Yahoo Finance via yfinance",
        "fetched_at": now_iso(),
    }


def find_metric(frame: pd.DataFrame, names: Iterable[str]) -> pd.Series | None:
    if frame is None or frame.empty:
        return None
    normalized = {re.sub(r"[^a-z0-9]", "", str(idx).lower()): idx for idx in frame.index}
    for name in names:
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        if key in normalized:
            return pd.to_numeric(frame.loc[normalized[key]], errors="coerce")
    for name in names:
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        for norm, original in normalized.items():
            if key in norm or norm in key:
                return pd.to_numeric(frame.loc[original], errors="coerce")
    return None


def financial_rows(instrument: Instrument, yahoo_symbol: str) -> list[dict[str, Any]]:
    try:
        ticker = yf.Ticker(yahoo_symbol)
        frames = [("quarterly", ticker.quarterly_income_stmt), ("annual", ticker.income_stmt)]
    except Exception as exc:  # noqa: BLE001
        print(f"  financial statement fetch failed {yahoo_symbol}: {exc}")
        return []
    output: list[dict[str, Any]] = []
    for period_type, frame in frames:
        if frame is None or frame.empty:
            continue
        revenue = find_metric(frame, ["Total Revenue", "Operating Revenue", "Revenue"])
        operating = find_metric(frame, ["Operating Income", "EBIT"])
        net = find_metric(frame, ["Net Income", "Net Income Common Stockholders"])
        eps = find_metric(frame, ["Diluted EPS", "Basic EPS"])
        columns = sorted(frame.columns, reverse=True)
        limit = 8 if period_type == "quarterly" else 5
        for idx, col in enumerate(columns[:limit]):
            def at(series: pd.Series | None, column: Any) -> float | None:
                return clean_number(series.get(column)) if series is not None else None

            rev = at(revenue, col)
            ni = at(net, col)
            compare_index = idx + (4 if period_type == "quarterly" else 1)
            rev_yoy = ni_yoy = None
            if compare_index < len(columns):
                old_col = columns[compare_index]
                old_rev = at(revenue, old_col)
                old_ni = at(net, old_col)
                if rev is not None and old_rev not in (None, 0):
                    rev_yoy = ((rev / old_rev) - 1) * 100
                if ni is not None and old_ni not in (None, 0):
                    ni_yoy = ((ni / old_ni) - 1) * 100
            output.append(
                {
                    "user_id": instrument.user_id,
                    "symbol": instrument.symbol,
                    "period_end": pd.Timestamp(col).date().isoformat(),
                    "period_type": period_type,
                    "revenue": rev,
                    "operating_income": at(operating, col),
                    "net_income": ni,
                    "eps": at(eps, col),
                    "revenue_yoy": clean_number(rev_yoy),
                    "net_income_yoy": clean_number(ni_yoy),
                    "currency": "INR",
                    "source": "Yahoo Finance via yfinance",
                    "fetched_at": now_iso(),
                }
            )
    return output


POSITIVE = {
    "order": 2, "contract": 2, "acquisition": 1, "acquires": 1, "approval": 2,
    "capacity": 1, "expansion": 1, "commissioned": 2, "launch": 1, "partnership": 1,
    "mou": 1, "buyback": 2, "bonus": 1, "dividend": 1, "debt reduction": 2,
    "rating upgrade": 2, "patent": 1, "export": 1, "record revenue": 2, "profit rises": 2,
}
NEGATIVE = {
    "default": -4, "fraud": -5, "investigation": -3, "downgrade": -2, "pledge": -2,
    "resignation": -1, "loss widens": -3, "profit falls": -2, "delay": -1, "cancelled": -3,
    "penalty": -2, "fine": -2, "insolvency": -5, "bankruptcy": -5, "fire": -2,
}
CATEGORIES = {
    "order": "Order / contract", "contract": "Order / contract", "acquisition": "Acquisition",
    "acquires": "Acquisition", "demerger": "Demerger", "bonus": "Dividend / bonus",
    "dividend": "Dividend / bonus", "capacity": "Capacity expansion", "commissioned": "Capacity expansion",
    "results": "Results", "profit": "Results", "revenue": "Results", "resignation": "Governance",
    "fraud": "Governance", "investigation": "Governance", "mou": "MOU / partnership",
}


def heuristic_impact(title: str, snippet: str) -> tuple[str, str, int, str]:
    text = f"{title} {snippet}".lower()
    score = 0
    hits = 0
    for phrase, weight in POSITIVE.items():
        if phrase in text:
            score += weight
            hits += 1
    for phrase, weight in NEGATIVE.items():
        if phrase in text:
            score += weight
            hits += 1
    score = max(-5, min(5, score))
    category = next((value for key, value in CATEGORIES.items() if key in text), "Other")
    label = "Bullish" if score >= 2 else "Bearish" if score <= -2 else "Neutral / monitor"
    confidence = "medium" if hits >= 2 else "low"
    summary = snippet.strip() or title.strip()
    if len(summary) > 420:
        summary = summary[:417].rstrip() + "…"
    return summary, category, score, f"{label}|{confidence}"


def ai_enrich(title: str, snippet: str, company: str) -> tuple[str, str, int, str] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        prompt = f"""Analyze this public-company news item for a personal portfolio dashboard.
Company: {company}
Title: {title}
Available excerpt: {snippet}
Return ONLY valid compact JSON with keys summary, category, impact_score, impact_label, confidence.
summary: 1-2 factual sentences, no hype. category: one of Order / contract, Acquisition, Demerger, Results, Capacity expansion, Dividend / bonus, Governance, MOU / partnership, Other. impact_score: integer -5 to +5 based on likely medium-term business impact, not predicted stock movement. impact_label: Bullish, Bearish, or Neutral / monitor. confidence: low, medium, or high. State uncertainty in the summary when details are insufficient."""
        response = client.responses.create(model=os.getenv("OPENAI_MODEL", "gpt-5-mini"), input=prompt)
        text = response.output_text.strip()
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            return None
        obj = json.loads(match.group(0))
        score = max(-5, min(5, int(obj.get("impact_score", 0))))
        label = str(obj.get("impact_label") or ("Bullish" if score >= 2 else "Bearish" if score <= -2 else "Neutral / monitor"))
        confidence = str(obj.get("confidence") or "low")
        return str(obj.get("summary") or snippet or title), str(obj.get("category") or "Other"), score, f"{label}|{confidence}"
    except Exception as exc:  # noqa: BLE001
        print(f"  AI enrichment failed: {exc}")
        return None


def news_items(instrument: Instrument, yahoo_symbol: str, company_name: str, existing_ids: set[tuple[str, str]], ai_budget: list[int]) -> list[dict[str, Any]]:
    query = company_name if company_name and company_name != instrument.symbol else base_symbol(instrument.symbol)
    try:
        search = yf.Search(query, max_results=8, news_count=8)
        raw_news = getattr(search, "news", []) or []
    except Exception as exc:  # noqa: BLE001
        print(f"  news search failed for {query}: {exc}")
        return []
    rows: list[dict[str, Any]] = []
    for item in raw_news[:6]:
        content = item.get("content") if isinstance(item, dict) else None
        content = content if isinstance(content, dict) else item
        title = str(content.get("title") or item.get("title") or "").strip()
        if not title:
            continue
        provider = content.get("provider") or {}
        source = provider.get("displayName") if isinstance(provider, dict) else provider
        source = source or item.get("publisher") or "Yahoo Finance news"
        canonical = content.get("canonicalUrl") or {}
        clickthrough = content.get("clickThroughUrl") or {}
        url = (canonical.get("url") if isinstance(canonical, dict) else None) or (clickthrough.get("url") if isinstance(clickthrough, dict) else None) or item.get("link") or ""
        published = content.get("pubDate") or item.get("providerPublishTime") or now_iso()
        if isinstance(published, (int, float)):
            published = datetime.fromtimestamp(published, tz=timezone.utc).isoformat()
        snippet = str(content.get("summary") or content.get("description") or item.get("summary") or "").strip()
        external_id = hashlib.sha256((url or f"{title}|{published}").encode("utf-8")).hexdigest()[:32]
        identity = (instrument.user_id or "static", external_id)
        if identity in existing_ids:
            continue
        enriched = None
        if ai_budget[0] > 0:
            enriched = ai_enrich(title, snippet, company_name)
            if enriched:
                ai_budget[0] -= 1
        summary, category, score, label_conf = enriched or heuristic_impact(title, snippet)
        label, confidence = label_conf.split("|", 1)
        rows.append(
            {
                "user_id": instrument.user_id,
                "symbol": instrument.symbol,
                "external_id": external_id,
                "published_at": published,
                "title": title,
                "source": str(source),
                "source_url": url,
                "summary": summary,
                "category": category,
                "impact_score": score,
                "impact_label": label,
                "confidence": confidence,
                "is_manual": False,
                "fetched_at": now_iso(),
            }
        )
        existing_ids.add(identity)
    return rows


def news_templates(yahoo_symbol: str, company_name: str, ai_budget: list[int]) -> list[dict[str, Any]]:
    query = company_name or yahoo_symbol
    try:
        search = yf.Search(query, max_results=8, news_count=8)
        raw_news = getattr(search, "news", []) or []
    except Exception as exc:  # noqa: BLE001
        print(f"  news search failed for {query}: {exc}")
        return []
    rows: list[dict[str, Any]] = []
    for item in raw_news[:6]:
        content = item.get("content") if isinstance(item, dict) else None
        content = content if isinstance(content, dict) else item
        title = str(content.get("title") or item.get("title") or "").strip()
        if not title:
            continue
        provider = content.get("provider") or {}
        source = provider.get("displayName") if isinstance(provider, dict) else provider
        source = source or item.get("publisher") or "Yahoo Finance news"
        canonical = content.get("canonicalUrl") or {}
        clickthrough = content.get("clickThroughUrl") or {}
        url = (canonical.get("url") if isinstance(canonical, dict) else None) or (clickthrough.get("url") if isinstance(clickthrough, dict) else None) or item.get("link") or ""
        published = content.get("pubDate") or item.get("providerPublishTime") or now_iso()
        if isinstance(published, (int, float)):
            published = datetime.fromtimestamp(published, tz=timezone.utc).isoformat()
        snippet = str(content.get("summary") or content.get("description") or item.get("summary") or "").strip()
        external_id = hashlib.sha256((url or f"{title}|{published}").encode("utf-8")).hexdigest()[:32]
        enriched = None
        if ai_budget[0] > 0:
            enriched = ai_enrich(title, snippet, company_name)
            if enriched:
                ai_budget[0] -= 1
        summary, category, score, label_conf = enriched or heuristic_impact(title, snippet)
        label, confidence = label_conf.split("|", 1)
        rows.append({
            "external_id": external_id, "published_at": published, "title": title,
            "source": str(source), "source_url": url, "summary": summary,
            "category": category, "impact_score": score, "impact_label": label,
            "confidence": confidence, "is_manual": False, "fetched_at": now_iso(),
        })
    return rows

def strip_user(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: v for k, v in row.items() if k != "user_id"} for row in rows]


def load_existing_json(path: Path) -> list[dict[str, Any]]:
    try:
        return json.loads(path.read_text())
    except Exception:  # noqa: BLE001
        return []


def write_json(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False, default=jsonable) + "\n")


def chunks(items: list[dict[str, Any]], size: int = 200) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-news", action="store_true")
    parser.add_argument("--skip-results", action="store_true")
    parser.add_argument("--only-cloud", action="store_true")
    parser.add_argument("--ai-max-items", type=int, default=int(os.getenv("AI_MAX_ITEMS", "15")))
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    sb = SupabaseREST()
    static_instruments = [] if args.only_cloud else load_static_instruments()
    cloud_instruments = sb.instruments() if sb.enabled else []
    instruments = cloud_instruments + static_instruments
    if not instruments:
        print("No instruments found. Import holdings or configure Supabase.")
        return 0

    print(f"Updating {len(instruments)} instrument records ({len(cloud_instruments)} cloud, {len(static_instruments)} static)")
    static_market: list[dict[str, Any]] = []
    static_results: list[dict[str, Any]] = []
    static_announcements = load_existing_json(DATA_DIR / "announcements.json")
    static_ids = {("static", str(r.get("external_id"))) for r in static_announcements if r.get("external_id")}
    cloud_ids = sb.existing_announcement_ids() if sb.enabled and not args.skip_news else set()
    ai_budget = [max(0, args.ai_max_items)]

    market_rows: list[dict[str, Any]] = []
    result_rows: list[dict[str, Any]] = []
    announcement_rows: list[dict[str, Any]] = []

    # Reuse resolved data for duplicate symbols across users.
    cache: dict[str, tuple[str, str, pd.DataFrame]] = {}
    financial_cache: dict[str, list[dict[str, Any]]] = {}
    news_cache: dict[str, list[dict[str, Any]]] = {}
    for idx, instrument in enumerate(instruments, 1):
        cache_key = instrument.yahoo_symbol or instrument.symbol
        print(f"[{idx}/{len(instruments)}] {instrument.symbol} -> {instrument.yahoo_symbol}")
        if cache_key not in cache:
            cache[cache_key] = resolve(instrument)
            time.sleep(0.08)
        yahoo_symbol, company_name, frame = cache[cache_key]
        snapshot = technical_snapshot(instrument, yahoo_symbol, frame)
        market_rows.append(snapshot)
        if instrument.user_id is None:
            static_market.append(snapshot)

        if not args.skip_results and not frame.empty:
            if yahoo_symbol not in financial_cache:
                template_instrument = Instrument(None, instrument.symbol, yahoo_symbol, company_name)
                financial_cache[yahoo_symbol] = financial_rows(template_instrument, yahoo_symbol)
            rows = [{**r, "user_id": instrument.user_id, "symbol": instrument.symbol} for r in financial_cache[yahoo_symbol]]
            result_rows.extend(rows)
            if instrument.user_id is None:
                static_results.extend(rows)

        if not args.skip_news:
            if yahoo_symbol not in news_cache:
                news_cache[yahoo_symbol] = news_templates(yahoo_symbol, company_name, ai_budget)
            ids = cloud_ids if instrument.user_id else static_ids
            rows = []
            for template in news_cache[yahoo_symbol]:
                identity = (instrument.user_id or "static", template["external_id"])
                if identity in ids:
                    continue
                row = {**template, "user_id": instrument.user_id, "symbol": instrument.symbol}
                rows.append(row)
                ids.add(identity)
            announcement_rows.extend(rows)
            if instrument.user_id is None:
                static_announcements.extend(rows)

    if sb.enabled:
        for batch in chunks([r for r in market_rows if r.get("user_id")]):
            sb.upsert("market_snapshots", batch, "user_id,symbol,as_of")
        for batch in chunks([r for r in result_rows if r.get("user_id")]):
            sb.upsert("financial_results", batch, "user_id,symbol,period_end,period_type")
        for batch in chunks([r for r in announcement_rows if r.get("user_id")]):
            sb.upsert("announcements", batch, "user_id,external_id")

    if static_instruments:
        # Keep one row per symbol in static fallback.
        latest_market = {r["symbol"]: r for r in static_market}
        write_json(DATA_DIR / "market.json", strip_user(sorted(latest_market.values(), key=lambda x: x["symbol"])))
        result_key = {(r["symbol"], r["period_end"], r["period_type"]): r for r in static_results}
        write_json(DATA_DIR / "results.json", strip_user(sorted(result_key.values(), key=lambda x: (x["symbol"], x["period_end"]), reverse=True)))
        ann_key = {r.get("external_id") or r.get("id") or f"{r.get('symbol')}|{r.get('title')}|{r.get('published_at')}": r for r in static_announcements}
        trimmed = sorted(ann_key.values(), key=lambda x: str(x.get("published_at", "")), reverse=True)[:600]
        write_json(DATA_DIR / "announcements.json", strip_user(trimmed))

    print(f"Done: {len(market_rows)} market snapshots, {len(result_rows)} result rows, {len(announcement_rows)} new announcements")
    return 0


if __name__ == "__main__":
    sys.exit(main())

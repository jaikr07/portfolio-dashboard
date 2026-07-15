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
    sector: str = "Unclassified"
    asset_type: str = "Equity"


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
            sector = (row.get("sector") or "Unclassified").strip()
            asset_type = (row.get("asset_type") or "Equity").strip()
            instruments.append(Instrument(None, symbol, yahoo_symbol, name, sector, asset_type))
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
            {"select": "*", "active": "eq.true", "order": "user_id,symbol"},
        )
        return [
            Instrument(
                r["user_id"],
                r["symbol"],
                r.get("yahoo_symbol") or f"{base_symbol(r['symbol'])}.NS",
                r.get("name") or r["symbol"],
                r.get("sector") or "Unclassified",
                r.get("asset_type") or "Equity",
            )
            for r in rows
        ]

    def existing_announcement_ids(self) -> set[tuple[str, str]]:
        rows = self.get(
            "announcements",
            {"select": "user_id,external_id", "is_manual": "eq.false", "external_id": "not.is.null"},
        )
        return {(r["user_id"], r["external_id"]) for r in rows if r.get("external_id")}


def history_for(ticker: str, period: str = "5y") -> pd.DataFrame:
    """Fetch daily price history with yfinance and direct Yahoo fallbacks."""
    try:
        frame = yf.download(
            tickers=ticker,
            period=period,
            interval="1d",
            auto_adjust=True,
            actions=False,
            repair=False,
            progress=False,
            threads=False,
            timeout=30,
            multi_level_index=False,
        )
        if frame is not None and not frame.empty:
            frame = frame.dropna(how="all")
            if "Close" in frame.columns:
                close_count = pd.to_numeric(frame["Close"], errors="coerce").notna().sum()
                if close_count >= 20:
                    print(f"  price history received for {ticker} through yf.download: {len(frame)} rows")
                    return frame
    except Exception as exc:  # noqa: BLE001
        print(f"  yf.download failed for {ticker}: {type(exc).__name__}: {exc}")

    encoded_ticker = requests.utils.quote(ticker, safe="")
    requested_range = period if period in {"1y", "2y", "5y", "10y", "max"} else "2y"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
    }
    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        try:
            url = f"https://{host}/v8/finance/chart/{encoded_ticker}"
            response = requests.get(
                url,
                params={
                    "range": requested_range,
                    "interval": "1d",
                    "events": "div,splits",
                    "includeAdjustedClose": "true",
                },
                headers=headers,
                timeout=30,
            )
            if response.status_code == 429:
                raise RuntimeError("Yahoo rate limit: HTTP 429")
            response.raise_for_status()
            payload = response.json()
            chart = payload.get("chart") or {}
            if chart.get("error"):
                raise RuntimeError(str(chart["error"]))
            results = chart.get("result") or []
            if not results:
                raise RuntimeError("Yahoo returned no chart result")
            result = results[0]
            timestamps = result.get("timestamp") or []
            indicators = result.get("indicators") or {}
            quote_rows = indicators.get("quote") or []
            if not timestamps or not quote_rows:
                raise RuntimeError("Yahoo returned no timestamps or OHLC data")
            quotes = quote_rows[0]
            adjusted_rows = indicators.get("adjclose") or []
            adjusted = adjusted_rows[0].get("adjclose", []) if adjusted_rows else []
            close_values = adjusted or quotes.get("close") or []
            row_count = len(timestamps)

            def sized(values: list | None) -> list:
                values = list(values or [])
                if len(values) < row_count:
                    values.extend([None] * (row_count - len(values)))
                return values[:row_count]

            frame = pd.DataFrame(
                {
                    "Open": sized(quotes.get("open")),
                    "High": sized(quotes.get("high")),
                    "Low": sized(quotes.get("low")),
                    "Close": sized(close_values),
                    "Volume": sized(quotes.get("volume")),
                },
                index=pd.to_datetime(timestamps, unit="s", utc=True, errors="coerce"),
            )
            frame.index.name = "Date"
            frame = frame[~frame.index.isna()]
            frame = frame[~frame.index.duplicated(keep="last")].sort_index()
            frame = frame.dropna(subset=["Close"])
            if len(frame) >= 20:
                print(f"  price history received for {ticker} through {host}: {len(frame)} rows")
                return frame
            raise RuntimeError(f"Only {len(frame)} valid rows returned; at least 20 required")
        except Exception as exc:  # noqa: BLE001
            print(f"  direct Yahoo history failed for {ticker} through {host}: {type(exc).__name__}: {exc}")
            time.sleep(0.5)
    print(f"  no usable price history received for {ticker}")
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
            volume = pd.to_numeric(frame["Volume"], errors="coerce").reindex(close.index).fillna(0)
        else:
            volume = pd.Series(0.0, index=close.index)

    base = {
        "user_id": instrument.user_id,
        "symbol": instrument.symbol,
        "yahoo_symbol": yahoo_symbol,
        "sector": instrument.sector or "Unclassified",
        "asset_type": instrument.asset_type or "Equity",
    }
    if len(close) < 20:
        return {
            **base,
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

    def period_return(sessions: int) -> float | None:
        if len(close) <= sessions:
            return None
        old = float(close.iloc[-sessions - 1])
        return ((c / old) - 1) * 100 if old else None

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
        **base,
        "as_of": close.index[-1].date().isoformat(),
        "close": clean_number(c),
        "daily_change_pct": clean_number(daily_change),
        "return_1m_pct": clean_number(period_return(21)),
        "return_3m_pct": clean_number(period_return(63)),
        "return_6m_pct": clean_number(period_return(126)),
        "return_1y_pct": clean_number(period_return(252)),
        "return_2y_pct": clean_number(period_return(504)),
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


def pct_change(current: float | None, previous: float | None, absolute: bool = False) -> float | None:
    if current is None or previous in (None, 0):
        return None
    a = abs(current) if absolute else current
    b = abs(previous) if absolute else previous
    if b == 0:
        return None
    return ((a / b) - 1) * 100


def safe_margin(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator * 100


def result_quality_score(row: dict[str, Any]) -> tuple[int, str]:
    """Decision-oriented score based on growth, margins and cash conversion."""
    score = 50
    rev_yoy = row.get("revenue_yoy")
    profit_yoy = row.get("net_income_yoy")
    margin_delta = row.get("operating_margin_change_yoy_pp")
    ocf_margin = row.get("ocf_margin_pct")
    conversion = row.get("cash_conversion_pct")
    fcf_margin = row.get("fcf_margin_pct")

    if rev_yoy is not None:
        score += 18 if rev_yoy >= 20 else 10 if rev_yoy >= 5 else -8 if rev_yoy < 0 else 3
    if profit_yoy is not None:
        score += 18 if profit_yoy >= 20 else 9 if profit_yoy >= 5 else -14 if profit_yoy < 0 else 2
    if margin_delta is not None:
        score += 12 if margin_delta >= 2 else 6 if margin_delta > 0 else -12 if margin_delta <= -2 else -4
    if ocf_margin is not None:
        score += 10 if ocf_margin >= 12 else 5 if ocf_margin > 0 else -12
    if conversion is not None:
        score += 10 if conversion >= 100 else 5 if conversion >= 70 else -8 if conversion < 40 else 0
    if fcf_margin is not None:
        score += 8 if fcf_margin > 0 else -8

    score = max(0, min(100, int(round(score))))
    label = "Improving" if score >= 70 else "Weakening" if score < 40 else "Mixed / stable"
    return score, label


def financial_rows(instrument: Instrument, yahoo_symbol: str) -> list[dict[str, Any]]:
    if str(instrument.asset_type).lower() == "etf":
        return []
    try:
        ticker = yf.Ticker(yahoo_symbol)
        income_frames = {
            "quarterly": ticker.quarterly_income_stmt,
            "annual": ticker.income_stmt,
        }
        cash_frames = {
            "quarterly": ticker.quarterly_cashflow,
            "annual": ticker.cashflow,
        }
    except Exception as exc:  # noqa: BLE001
        print(f"  financial statement fetch failed {yahoo_symbol}: {exc}")
        return []

    output: list[dict[str, Any]] = []
    for period_type, frame in income_frames.items():
        if frame is None or frame.empty:
            continue
        cash = cash_frames.get(period_type)
        revenue = find_metric(frame, ["Total Revenue", "Operating Revenue", "Revenue"])
        operating = find_metric(frame, ["Operating Income", "EBIT"])
        net = find_metric(frame, ["Net Income", "Net Income Common Stockholders"])
        eps = find_metric(frame, ["Diluted EPS", "Basic EPS"])
        ocf = find_metric(cash, ["Operating Cash Flow", "Total Cash From Operating Activities", "Cash Flow From Continuing Operating Activities"])
        capex = find_metric(cash, ["Capital Expenditure", "Capital Expenditures", "Purchase Of PPE", "Purchase Of Property Plant And Equipment"])
        reported_fcf = find_metric(cash, ["Free Cash Flow"])

        columns = sorted(frame.columns, reverse=True)
        limit = 8 if period_type == "quarterly" else 5

        def at(series: pd.Series | None, column: Any) -> float | None:
            return clean_number(series.get(column)) if series is not None and column in series.index else None

        for idx, col in enumerate(columns[:limit]):
            rev = at(revenue, col)
            op = at(operating, col)
            ni = at(net, col)
            eps_value = at(eps, col)
            ocf_value = at(ocf, col)
            capex_value = at(capex, col)
            fcf_value = at(reported_fcf, col)
            if fcf_value is None and ocf_value is not None and capex_value is not None:
                fcf_value = ocf_value + capex_value if capex_value < 0 else ocf_value - capex_value

            yoy_index = idx + (4 if period_type == "quarterly" else 1)
            sequential_index = idx + 1
            yoy_col = columns[yoy_index] if yoy_index < len(columns) else None
            sequential_col = columns[sequential_index] if sequential_index < len(columns) else None

            old_rev = at(revenue, yoy_col) if yoy_col is not None else None
            old_op = at(operating, yoy_col) if yoy_col is not None else None
            old_ni = at(net, yoy_col) if yoy_col is not None else None
            old_eps = at(eps, yoy_col) if yoy_col is not None else None
            old_ocf = at(ocf, yoy_col) if yoy_col is not None else None
            old_capex = at(capex, yoy_col) if yoy_col is not None else None
            old_fcf = at(reported_fcf, yoy_col) if yoy_col is not None else None
            if old_fcf is None and old_ocf is not None and old_capex is not None:
                old_fcf = old_ocf + old_capex if old_capex < 0 else old_ocf - old_capex

            seq_rev = at(revenue, sequential_col) if sequential_col is not None else None
            seq_op = at(operating, sequential_col) if sequential_col is not None else None
            seq_ni = at(net, sequential_col) if sequential_col is not None else None

            op_margin = safe_margin(op, rev)
            old_op_margin = safe_margin(old_op, old_rev)
            row = {
                "user_id": instrument.user_id,
                "symbol": instrument.symbol,
                "period_end": pd.Timestamp(col).date().isoformat(),
                "period_type": period_type,
                "revenue": rev,
                "operating_income": op,
                "net_income": ni,
                "eps": eps_value,
                "operating_cash_flow": ocf_value,
                "capital_expenditure": capex_value,
                "free_cash_flow": fcf_value,
                "revenue_yoy": clean_number(pct_change(rev, old_rev)),
                "revenue_qoq": clean_number(pct_change(rev, seq_rev)) if period_type == "quarterly" else None,
                "operating_income_yoy": clean_number(pct_change(op, old_op)),
                "operating_income_qoq": clean_number(pct_change(op, seq_op)) if period_type == "quarterly" else None,
                "net_income_yoy": clean_number(pct_change(ni, old_ni)),
                "net_income_qoq": clean_number(pct_change(ni, seq_ni)) if period_type == "quarterly" else None,
                "eps_yoy": clean_number(pct_change(eps_value, old_eps)),
                "ocf_yoy": clean_number(pct_change(ocf_value, old_ocf)),
                "capex_yoy": clean_number(pct_change(capex_value, old_capex, absolute=True)),
                "fcf_yoy": clean_number(pct_change(fcf_value, old_fcf)),
                "operating_margin_pct": clean_number(op_margin),
                "operating_margin_change_yoy_pp": clean_number(op_margin - old_op_margin) if op_margin is not None and old_op_margin is not None else None,
                "net_margin_pct": clean_number(safe_margin(ni, rev)),
                "ocf_margin_pct": clean_number(safe_margin(ocf_value, rev)),
                "fcf_margin_pct": clean_number(safe_margin(fcf_value, rev)),
                "cash_conversion_pct": clean_number(safe_margin(ocf_value, ni)),
                "capex_intensity_pct": clean_number(safe_margin(abs(capex_value), rev)) if capex_value is not None else None,
                "currency": "INR",
                "source": "Yahoo Finance via yfinance",
                "fetched_at": now_iso(),
            }
            quality_score, quality_label = result_quality_score(row)
            row["quality_score"] = quality_score
            row["quality_label"] = quality_label
            output.append(row)
    return output


POSITIVE = {
    "order win": 2, "order": 1, "contract": 1, "letter of award": 2,
    "acquisition": 1, "acquires": 1, "approval": 2, "capacity": 1,
    "expansion": 1, "commissioned": 2, "launch": 1, "partnership": 1,
    "buyback": 1, "debt reduction": 2, "rating upgrade": 2, "patent": 1,
    "export": 1, "record revenue": 2, "record profit": 2, "profit rises": 2,
    "profit jumps": 2, "revenue rises": 1, "margin expands": 2,
}
NEGATIVE = {
    "default": -4, "fraud": -5, "investigation": -3, "downgrade": -2,
    "pledge": -2, "resignation": -1, "loss widens": -3, "profit falls": -2,
    "revenue falls": -2, "margin contracts": -2, "delay": -1, "cancelled": -3,
    "penalty": -2, "fine": -2, "insolvency": -5, "bankruptcy": -5,
    "fire": -2, "shutdown": -3, "suspension": -3, "regulatory action": -3,
    "dilution": -2, "debt funded": -1,
}
CATEGORIES = {
    "order": "Order / contract", "contract": "Order / contract", "letter of award": "Order / contract",
    "acquisition": "Acquisition", "acquires": "Acquisition", "demerger": "Demerger",
    "bonus": "Dividend / bonus", "dividend": "Dividend / bonus", "buyback": "Capital allocation",
    "capacity": "Capacity expansion", "commissioned": "Capacity expansion", "expansion": "Capacity expansion",
    "results": "Results", "profit": "Results", "revenue": "Results", "margin": "Results",
    "resignation": "Governance", "fraud": "Governance", "investigation": "Governance",
    "mou": "MOU / partnership", "memorandum of understanding": "MOU / partnership",
    "rating": "Credit / balance sheet", "debt": "Credit / balance sheet",
}


def _category_reason(category: str, score: int, text: str) -> tuple[str, str, str]:
    positive = score >= 2
    negative = score <= -2
    if category == "Order / contract":
        reason = (
            "This can improve revenue visibility and capacity utilisation if the order is meaningful relative to annual sales and is executed at healthy margins."
            if not negative else
            "The order-related update appears adverse and may reduce revenue visibility or execution confidence."
        )
        watch = "Compare order value with annual revenue; verify execution period, margins, customer concentration and cancellation clauses."
        horizon = "Near to medium term"
    elif category == "Acquisition":
        reason = (
            "The acquisition may add capabilities, customers or market access, but value creation depends on the price paid, integration and funding structure."
        )
        watch = "Check purchase valuation, debt or dilution, acquired profitability, integration milestones and management's synergy targets."
        horizon = "Medium term"
    elif category == "Demerger":
        reason = "A demerger can improve strategic focus and make separate businesses easier to value, but it does not by itself improve operating performance."
        watch = "Track the share-entitlement ratio, debt allocation, listing timeline, tax effects and standalone profitability of each entity."
        horizon = "Medium to long term"
    elif category == "Capacity expansion":
        reason = "New capacity can support future growth, but the benefit appears only when demand, commissioning and utilisation develop as planned."
        watch = "Track commissioning date, capex funding, utilisation ramp-up, incremental revenue potential and return on capital."
        horizon = "Medium term"
    elif category == "Results":
        reason = (
            "The result signals improving business momentum through growth or margin progression."
            if positive else "The result signals pressure on growth, margins or earnings quality." if negative else
            "The result is mixed; the headline alone is insufficient without growth, margin and cash-flow context."
        )
        watch = "Check revenue and profit growth, margin movement, operating cash flow, working capital, guidance and one-off items."
        horizon = "Immediate to medium term"
    elif category == "MOU / partnership":
        reason = "An MOU can create an opportunity pipeline, but it is usually non-binding and should not be treated as confirmed revenue."
        watch = "Wait for a binding contract, order value, commercial terms, investment commitment and execution timeline."
        horizon = "Medium term"
    elif category == "Dividend / bonus":
        reason = "This changes shareholder distribution or share count, but normally does not change the underlying earnings power of the business."
        watch = "Check payout sustainability, record date, cash impact and whether the action is supported by free cash flow."
        horizon = "Near term"
    elif category == "Capital allocation":
        reason = "The action may improve per-share value when funded by surplus cash and executed at an attractive valuation."
        watch = "Check buyback size, price, funding source, acceptance ratio and post-transaction leverage."
        horizon = "Near to medium term"
    elif category == "Governance":
        reason = (
            "The development raises governance or management-continuity risk and can weaken confidence until facts are clarified."
            if negative else "The governance update needs context before its business effect can be assessed."
        )
        watch = "Verify the original filing, board response, auditor/regulator comments, related-party exposure and management succession."
        horizon = "Immediate"
    elif category == "Credit / balance sheet":
        reason = (
            "The update may strengthen funding access and reduce financial risk."
            if positive else "The update may increase refinancing cost, leverage or balance-sheet risk." if negative else
            "The balance-sheet effect is not yet clear from the available headline."
        )
        watch = "Track net debt, interest cost, maturity schedule, credit-rating rationale and covenant headroom."
        horizon = "Near to medium term"
    else:
        reason = (
            "The announcement appears directionally positive, but its financial materiality is not clear from the available information."
            if positive else "The announcement may create business risk, but its financial materiality needs verification." if negative else
            "The announcement does not yet show a clear change in earnings, cash flow or competitive position."
        )
        watch = "Open the original source and identify quantified revenue, margin, cash-flow, capex, debt and timeline implications."
        horizon = "Unclear"
    return reason, watch, horizon


def heuristic_impact(title: str, snippet: str) -> dict[str, Any]:
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

    category = next((value for key, value in CATEGORIES.items() if key in text), "Other")
    if category == "MOU / partnership" and not any(k in text for k in ("binding", "order", "contract", "award")):
        score = min(score, 1)
    if category == "Dividend / bonus":
        score = max(-1, min(score, 1))
    if "largest order" in text or "multi-year order" in text or "major order" in text:
        score += 1
    if "subject to" in text or "non-binding" in text:
        score -= 1
    score = max(-5, min(5, score))

    label = "Bullish" if score >= 2 else "Bearish" if score <= -2 else "Neutral / monitor"
    confidence = "medium" if hits >= 2 else "low"
    summary = snippet.strip() or title.strip()
    if len(summary) > 420:
        summary = summary[:417].rstrip() + "…"
    impact_reason, watch_items, horizon = _category_reason(category, score, text)
    materiality = "High" if abs(score) >= 4 else "Medium" if abs(score) >= 2 else "Low / unquantified"
    return {
        "summary": summary,
        "category": category,
        "impact_score": score,
        "impact_label": label,
        "confidence": confidence,
        "impact_reason": impact_reason,
        "watch_items": watch_items,
        "time_horizon": horizon,
        "materiality": materiality,
    }


def ai_enrich(title: str, snippet: str, company: str) -> dict[str, Any] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        prompt = f"""Analyze this public-company news item for a decision-focused personal portfolio dashboard.
Company: {company}
Title: {title}
Available excerpt: {snippet}
Return ONLY valid compact JSON with keys:
summary, category, impact_score, impact_label, confidence, impact_reason, watch_items, time_horizon, materiality.
Rules:
- summary: 1-2 factual sentences, no hype.
- category: one of Order / contract, Acquisition, Demerger, Results, Capacity expansion, Dividend / bonus, Capital allocation, Governance, MOU / partnership, Credit / balance sheet, Other.
- impact_score: integer -5 to +5 for likely medium-term BUSINESS impact, not predicted stock-price movement.
- impact_label: Bullish, Bearish, or Neutral / monitor.
- impact_reason: explain specifically how it could affect revenue visibility, margins, cash flow, leverage, competitive position or governance.
- watch_items: the 2-4 facts an investor should verify next.
- time_horizon: Immediate, Near term, Medium term, Long term, or Unclear.
- materiality: High, Medium, or Low / unquantified.
- confidence: low, medium, or high based only on the available evidence.
State uncertainty rather than inventing figures."""
        response = client.responses.create(model=os.getenv("OPENAI_MODEL", "gpt-5-mini"), input=prompt)
        text = response.output_text.strip()
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            return None
        obj = json.loads(match.group(0))
        score = max(-5, min(5, int(obj.get("impact_score", 0))))
        fallback = heuristic_impact(title, snippet)
        return {
            "summary": str(obj.get("summary") or fallback["summary"]),
            "category": str(obj.get("category") or fallback["category"]),
            "impact_score": score,
            "impact_label": str(obj.get("impact_label") or ("Bullish" if score >= 2 else "Bearish" if score <= -2 else "Neutral / monitor")),
            "confidence": str(obj.get("confidence") or "low"),
            "impact_reason": str(obj.get("impact_reason") or fallback["impact_reason"]),
            "watch_items": str(obj.get("watch_items") or fallback["watch_items"]),
            "time_horizon": str(obj.get("time_horizon") or fallback["time_horizon"]),
            "materiality": str(obj.get("materiality") or ("High" if abs(score) >= 4 else "Medium" if abs(score) >= 2 else "Low / unquantified")),
        }
    except Exception as exc:  # noqa: BLE001
        print(f"  AI enrichment failed: {exc}")
        return None


def normalize_announcement(row: dict[str, Any]) -> dict[str, Any]:
    """Backfill decision fields for announcements created by older versions."""
    fallback = heuristic_impact(str(row.get("title") or ""), str(row.get("summary") or ""))
    return {
        **row,
        "summary": row.get("summary") or fallback["summary"],
        "category": row.get("category") or fallback["category"],
        "impact_score": row.get("impact_score") if row.get("impact_score") is not None else fallback["impact_score"],
        "impact_label": row.get("impact_label") or fallback["impact_label"],
        "confidence": row.get("confidence") or fallback["confidence"],
        "impact_reason": row.get("impact_reason") or fallback["impact_reason"],
        "watch_items": row.get("watch_items") or fallback["watch_items"],
        "time_horizon": row.get("time_horizon") or fallback["time_horizon"],
        "materiality": row.get("materiality") or fallback["materiality"],
    }


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
        analysis = enriched or heuristic_impact(title, snippet)
        rows.append(
            {
                "user_id": instrument.user_id,
                "symbol": instrument.symbol,
                "external_id": external_id,
                "published_at": published,
                "title": title,
                "source": str(source),
                "source_url": url,
                **analysis,
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
        analysis = enriched or heuristic_impact(title, snippet)
        rows.append({
            "external_id": external_id, "published_at": published, "title": title,
            "source": str(source), "source_url": url, **analysis,
            "is_manual": False, "fetched_at": now_iso(),
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
    static_announcements = [normalize_announcement(r) for r in load_existing_json(DATA_DIR / "announcements.json")]
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
                template_instrument = Instrument(None, instrument.symbol, yahoo_symbol, company_name, instrument.sector, instrument.asset_type)
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

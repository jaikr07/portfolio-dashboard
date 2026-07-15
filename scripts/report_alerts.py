#!/usr/bin/env python3
"""Compare old/new static snapshots and write newly triggered material alerts."""
from __future__ import annotations
import argparse, json
from pathlib import Path

CRITICAL_PREFIXES = (
    "Price below 200 DMA",
    "Golden cross",
    "Death cross",
    "52-week breakout",
    "52-week breakdown",
)

def load(path: str):
    try:
        rows=json.loads(Path(path).read_text())
        return {r.get('symbol'):r for r in rows if r.get('symbol')}
    except Exception:
        return {}

def critical(row):
    return {a for a in (row or {}).get('alerts',[]) if any(a.startswith(p) for p in CRITICAL_PREFIXES)}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--before',required=True);ap.add_argument('--after',required=True);ap.add_argument('--output',required=True);args=ap.parse_args()
    before,after=load(args.before),load(args.after)
    events=[]
    for symbol,row in sorted(after.items()):
        new=critical(row)-critical(before.get(symbol))
        for alert in sorted(new):
            events.append((symbol,alert,row.get('close'),row.get('trend_label')))
    out=Path(args.output)
    if not events:
        out.write_text('')
        print('No newly triggered critical alerts.')
        return
    lines=['## Newly triggered portfolio alerts','', 'These signals were absent from the preceding snapshot and appeared in the latest end-of-day refresh.','']
    for symbol,alert,close,trend in events[:30]:
        close_text=f"₹{float(close):,.2f}" if close is not None else 'price unavailable'
        lines.append(f"- **{symbol}** — {alert} ({close_text}; {trend or 'trend unavailable'})")
    if len(events)>30: lines.append(f"- …and {len(events)-30} more events. Open the dashboard for the complete list.")
    lines += ['', '> Automated technical signals are not investment recommendations. Verify prices, liquidity and company fundamentals before acting.']
    out.write_text('\n'.join(lines)+'\n')
    print(f'Wrote {len(events)} new critical alerts.')

if __name__=='__main__': main()

"""Give each Meridian demo user a sample Terminal portfolio and price alerts (idempotent).

Uses only real data through the platform's own API: entry prices are the actual daily
closes from the Terminal's history feed on the chosen dates, and alert levels sit around
the current live quote. Nothing is invented; the book is labelled as a sample.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\seed_terminal_demo.py [--base http://localhost:8000]
"""
from __future__ import annotations

import argparse
import os
import re
from datetime import datetime, timezone

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = open(os.path.join(ROOT, "scripts", "seed_demo_data.py"), encoding="utf-8").read()
ADMIN_PW = re.search(r'^ADMIN_PASSWORD\s*=\s*"([^"]+)"', SEED, re.M).group(1)

USERS = {
    "dpark@meridian.com": ADMIN_PW, "quant@meridian.com": ADMIN_PW, "s.okonkwo@meridian.com": ADMIN_PW,
    "j.whitfield@meridian.com": ADMIN_PW, "a.reyes@meridian.com": ADMIN_PW, "research@meridian.com": ADMIN_PW,
}
BOOK = "Meridian Model Book (sample)"
# symbol: (shares, bars_ago_for_first_buy)
HOLDINGS = {"SPY": (60, 110), "QQQ": (40, 100), "GLD": (50, 90), "AAPL": (120, 105), "MSFT": (45, 95), "NVDA": (80, 85)}
ALERTS = [("SPY", "above", 1.04, "Breakout watch"), ("SPY", "below", 0.95, "Drawdown watch"),
          ("NVDA", "above", 1.06, "Earnings-run target"), ("AAPL", "below", 0.94, "Support break"),
          ("GLD", "above", 1.05, "Safe-haven bid")]


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(hour=15, minute=0, second=0).isoformat()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args()
    for email, pw in USERS.items():
        with httpx.Client(base_url=args.base, timeout=90) as c:
            r = c.post("/auth/login", json={"email": email, "password": pw})
            if r.status_code != 200:
                print(f"{email}: login failed ({r.status_code})")
                continue
            c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
            made = []
            books = c.get("/terminal/portfolios")
            existing = next((b for b in books.json() if b["name"] == BOOK), None) if books.status_code == 200 else None
            if existing and c.get(f"/terminal/portfolios/{existing['id']}/transactions").json():
                existing = "done"  # already has trades
            if books.status_code == 200 and existing != "done":
                if existing:
                    pid = existing["id"]  # book was created earlier but never filled
                    p = None
                else:
                    p = c.post("/terminal/portfolios", json={"name": BOOK, "base_currency": "USD", "cash": 150000})
                    pid = p.json()["id"] if p.status_code == 201 else None
                if pid:
                    for sym, (shares, ago) in HOLDINGS.items():
                        hist = c.get(f"/terminal/history/{sym}", params={"range": "1Y", "interval": "1d"})
                        body = hist.json() if hist.status_code == 200 else {}
                        candles = (body.get("data", body).get("candles") or [])
                        if len(candles) < ago + 5:
                            continue
                        buy = candles[-ago]
                        add = candles[-(ago // 2)]
                        c.post(f"/terminal/portfolios/{pid}/transactions", json={
                            "symbol": sym, "side": "buy", "quantity": shares, "price": round(buy["c"], 2),
                            "executed_at": iso(buy["t"]), "note": "Initial position"})
                        c.post(f"/terminal/portfolios/{pid}/transactions", json={
                            "symbol": sym, "side": "buy", "quantity": max(1, shares // 3), "price": round(add["c"], 2),
                            "executed_at": iso(add["t"]), "note": "Added on pullback"})
                        if sym == "AAPL":  # one realised trade so P&L shows both realised and open
                            out = candles[-12]
                            c.post(f"/terminal/portfolios/{pid}/transactions", json={
                                "symbol": sym, "side": "sell", "quantity": 30, "price": round(out["c"], 2),
                                "executed_at": iso(out["t"]), "note": "Trimmed"})
                    made.append("portfolio")
            have = c.get("/terminal/alerts")
            if have.status_code == 200 and not have.json():
                for sym, cond, mult, note in ALERTS:
                    q = c.get(f"/terminal/quote/{sym}")
                    last = (q.json().get("data") or {}).get("last") if q.status_code == 200 else None
                    if last:
                        c.post("/terminal/alerts", json={"symbol": sym, "condition": cond,
                                                         "target_price": round(last * mult, 2), "note": note})
                made.append("alerts")
            print(f"{email}: {', '.join(made) if made else 'already set'}")


if __name__ == "__main__":
    main()

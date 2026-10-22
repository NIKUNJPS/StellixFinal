"""Crypto (CoinGecko + Binance public market data) and news (published RSS feeds).

* CoinGecko's public API is documented and free for attributed use; it is rate limited
  (~30 calls/min), which the terminal cache keeps us well inside.
* Binance market data comes from ``data-api.binance.vision`` — Binance's documented
  public host for market data only (no account endpoints).
* News uses each publisher's published RSS feed. Only headline, publisher, time and
  link are kept; article text is never copied.
"""

from __future__ import annotations

import html
import json
import re
from email.utils import parsedate_to_datetime

import requests
from defusedxml import ElementTree as ET

_TIMEOUT = 15
_UA = {"User-Agent": "Stellix Labs market terminal", "Accept": "application/json"}
COINGECKO = "https://api.coingecko.com/api/v3"
BINANCE = "https://data-api.binance.vision/api/v3"


# ----------------------------------------------------------------------------- crypto
def _cg_headers() -> dict:
    from app.core.config import settings

    headers = {"User-Agent": "StellixLabs/1.0 (+https://stellixlabs.com)", "Accept": "application/json"}
    if settings.COINGECKO_API_KEY:
        headers["x-cg-demo-api-key"] = settings.COINGECKO_API_KEY
    return headers


def crypto_board(limit: int = 50) -> dict:
    r = requests.get(
        f"{COINGECKO}/coins/markets",
        params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": limit, "page": 1,
                "sparkline": "true", "price_change_percentage": "24h,7d"},
        headers=_cg_headers(), timeout=_TIMEOUT,
    )
    r.raise_for_status()
    g = requests.get(f"{COINGECKO}/global", headers=_cg_headers(), timeout=_TIMEOUT)
    g.raise_for_status()
    glob = g.json().get("data", {})
    pct = glob.get("market_cap_percentage", {})
    return {
        "coins": [
            {
                "id": c["id"],
                "symbol": str(c["symbol"]).upper(),
                "name": c["name"],
                "image": c.get("image"),
                "rank": c.get("market_cap_rank"),
                "price": c.get("current_price"),
                "change_pct_24h": c.get("price_change_percentage_24h_in_currency"),
                "change_pct_7d": c.get("price_change_percentage_7d_in_currency"),
                "market_cap": c.get("market_cap"),
                "volume_24h": c.get("total_volume"),
                "sparkline_7d": [round(p, 6) for p in (c.get("sparkline_in_7d") or {}).get("price", [])][::4],
            }
            for c in r.json()
        ],
        "global": {
            "total_market_cap_usd": (glob.get("total_market_cap") or {}).get("usd"),
            "total_volume_usd": (glob.get("total_volume") or {}).get("usd"),
            "btc_dominance": pct.get("btc"),
            "eth_dominance": pct.get("eth"),
            "market_cap_change_pct_24h": glob.get("market_cap_change_percentage_24h_usd"),
        },
    }


# Fallback board when CoinGecko throttles: Binance's public 24h tickers for the
# largest USDT pairs. No market cap, rank or sparkline exist there — they stay None.
_FALLBACK_BASES = ("BTC", "ETH", "BNB", "XRP", "SOL", "DOGE", "ADA", "TRX", "AVAX", "LINK", "DOT", "TON",
                   "SHIB", "LTC", "BCH", "NEAR", "UNI", "APT", "XLM", "ATOM")


def binance_board() -> dict:
    pairs = [f"{b}USDT" for b in _FALLBACK_BASES]
    r = requests.get(f"{BINANCE}/ticker/24hr", params={"symbols": json.dumps(pairs, separators=(",", ":"))},
                     headers=_UA, timeout=_TIMEOUT)
    r.raise_for_status()
    by_pair = {t["symbol"]: t for t in r.json()}
    coins = []
    for base in _FALLBACK_BASES:
        t = by_pair.get(f"{base}USDT")
        if not t:
            continue
        coins.append({
            "id": base.lower(), "symbol": base, "name": base, "image": None, "rank": None,
            "price": float(t["lastPrice"]), "change_pct_24h": float(t["priceChangePercent"]), "change_pct_7d": None,
            "market_cap": None, "volume_24h": float(t["quoteVolume"]), "sparkline_7d": [],
        })
    return {"coins": coins, "global": None, "fallback": True}


_BINANCE_INTERVALS = {"15m", "1h", "4h", "1d", "1w"}


def _pair(symbol: str) -> str:
    base = symbol.upper().replace("-USD", "").replace("USDT", "").replace("-", "")
    if not re.fullmatch(r"[A-Z0-9]{2,12}", base):
        raise ValueError("invalid crypto symbol")
    return f"{base}USDT"


def crypto_klines(symbol: str, interval: str = "1d", limit: int = 365) -> dict:
    if interval not in _BINANCE_INTERVALS:
        raise ValueError(f"interval must be one of {sorted(_BINANCE_INTERVALS)}")
    pair = _pair(symbol)
    r = requests.get(f"{BINANCE}/klines", params={"symbol": pair, "interval": interval, "limit": min(limit, 1000)},
                     headers=_UA, timeout=_TIMEOUT)
    if r.status_code == 400:
        raise LookupError(f"{pair} is not listed on Binance")
    r.raise_for_status()
    return {
        "pair": pair,
        "interval": interval,
        "candles": [
            {"t": int(k[0] // 1000), "o": float(k[1]), "h": float(k[2]), "l": float(k[3]), "c": float(k[4]), "v": float(k[5])}
            for k in r.json()
        ],
    }


def crypto_orderbook(symbol: str, limit: int = 20) -> dict:
    pair = _pair(symbol)
    r = requests.get(f"{BINANCE}/depth", params={"symbol": pair, "limit": limit}, headers=_UA, timeout=_TIMEOUT)
    if r.status_code == 400:
        raise LookupError(f"{pair} is not listed on Binance")
    r.raise_for_status()
    d = r.json()
    return {
        "pair": pair,
        "bids": [[float(p), float(q)] for p, q in d.get("bids", [])],
        "asks": [[float(p), float(q)] for p, q in d.get("asks", [])],
    }


# ----------------------------------------------------------------------------- news
_TAG = re.compile(r"<[^>]+>")


def _parse_rss(xml_text: str, default_publisher: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except (ET.ParseError, ValueError):
        return []
    out = []
    for item in root.iter("item"):
        title = html.unescape(_TAG.sub("", item.findtext("title") or "")).strip()
        link = (item.findtext("link") or "").strip()
        if not title or not link.startswith(("http://", "https://")):
            continue
        source = item.find("source")
        publisher = (source.text.strip() if source is not None and source.text else None) or default_publisher
        # Google News titles end with " - Publisher"; keep the headline clean.
        if publisher and title.endswith(f" - {publisher}"):
            title = title[: -len(publisher) - 3].rstrip()
        published = None
        raw_date = item.findtext("pubDate")
        if raw_date:
            try:
                published = parsedate_to_datetime(raw_date).isoformat()
            except (TypeError, ValueError):
                published = None
        out.append({"title": title, "link": link, "publisher": publisher, "published_at": published})
    return out


def _norm(title: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", title.lower())[:80]


def news(symbol: str | None = None, query: str | None = None, limit: int = 40) -> list[dict]:
    items: list[dict] = []
    if symbol:
        r = requests.get("https://feeds.finance.yahoo.com/rss/2.0/headline",
                         params={"s": symbol, "region": "US", "lang": "en-US"},
                         headers={"User-Agent": _UA["User-Agent"]}, timeout=_TIMEOUT)
        if r.ok:
            items += _parse_rss(r.text, "Yahoo Finance")
    q = query or (f"{symbol} stock" if symbol else "stock market")
    g = requests.get("https://news.google.com/rss/search", params={"q": q, "hl": "en-US", "gl": "US", "ceid": "US:en"},
                     headers={"User-Agent": _UA["User-Agent"]}, timeout=_TIMEOUT)
    if g.ok:
        items += _parse_rss(g.text, "Google News")
    if not items and not (g.ok):
        g.raise_for_status()
    seen: set[str] = set()
    unique = []
    for it in items:
        key = _norm(it["title"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)
    unique.sort(key=lambda x: x["published_at"] or "", reverse=True)
    return unique[:limit]

"""Batch 31 (ADR 0010) — Market Terminal: OpenTerminal parity on official sources.

Hermetic: every upstream (yfinance, SEC, FINRA, RSS, CoinGecko/Binance) is replaced by
fixtures shaped like the real responses captured live on 2026-09-28; Redis is an
in-memory fake. Covers the math (Greeks, average-cost P&L), the honest cache contract,
the parsers (RSS, SEC Form 4, FINRA), owner isolation of user data, alerts, error
mapping, the Agent Desk holdings link, and the terminal chat context.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, date, datetime, timedelta

import pytest
from app.core.config import settings
from app.core.security import create_access_token
from app.db.tenant import bind_organization
from app.models.notification import Notification, NotificationType
from app.models.regime_label import RegimeLabelRecord
from app.models.terminal import PriceAlert, PriceAlertStatus
from app.models.user import UserRole
from app.regime.taxonomy import RegimeLabel
from app.terminal import cache as tcache
from app.terminal import greeks, holdings, market, userdata
from app.terminal.sources import crypto_news, official
from sqlalchemy import select

from tests.helpers import add_user_to_org, bearer, create_org_user


# --------------------------------------------------------------------------- fakes
class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.published: list[tuple[str, str]] = []

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.store:
            return False
        self.store[key] = value
        return True

    async def delete(self, key):
        self.store.pop(key, None)
        return 1

    async def publish(self, channel, message):
        self.published.append((channel, message))
        return 1


@pytest.fixture
def redis(monkeypatch):
    from app.clients import redis_client

    fake = FakeRedis()
    monkeypatch.setattr(redis_client, "get_client", lambda: fake)
    return fake


def _token(user) -> dict[str, str]:
    return bearer(create_access_token(user_id=user.id, organization_id=user.organization_id, role=user.role.value))


async def _org(maker, slug: str, role: UserRole = UserRole.RESEARCHER):
    return await create_org_user(maker, org_name=f"Org {slug}", slug=slug, email=f"{slug}@term.io", role=role)


# --------------------------------------------------------------------------- Greeks
def test_black_scholes_greeks_match_reference_values():
    # Hull, Options Futures & Other Derivatives: S=K=100, T=1, r=5%, sigma=20%.
    c = greeks.bs_greeks(spot=100, strike=100, years=1, rate=0.05, vol=0.2, call=True)
    p = greeks.bs_greeks(spot=100, strike=100, years=1, rate=0.05, vol=0.2, call=False)
    assert c.delta == pytest.approx(0.6368, abs=1e-4)
    assert c.gamma == pytest.approx(0.018762, abs=1e-5)
    assert c.vega == pytest.approx(0.37524, abs=1e-4)            # per 1 vol point
    assert c.theta == pytest.approx(-6.4140 / 365, abs=1e-4)      # per calendar day
    assert c.rho == pytest.approx(0.53232, abs=1e-4)              # per 1 rate point
    assert p.delta == pytest.approx(c.delta - 1, abs=1e-9)
    assert p.gamma == pytest.approx(c.gamma) and p.vega == pytest.approx(c.vega)
    call = greeks.bs_price(spot=100, strike=100, years=1, rate=0.05, vol=0.2, call=True)
    put = greeks.bs_price(spot=100, strike=100, years=1, rate=0.05, vol=0.2, call=False)
    assert call - put == pytest.approx(100 - 100 * math.exp(-0.05), abs=1e-9)  # put-call parity


def test_greeks_undefined_inputs_return_none():
    assert greeks.bs_greeks(spot=100, strike=100, years=0, rate=0.05, vol=0.2, call=True) is None
    assert greeks.bs_greeks(spot=100, strike=100, years=1, rate=0.05, vol=None, call=True) is None
    assert greeks.bs_greeks(spot=None, strike=100, years=1, rate=0.05, vol=0.2, call=True) is None


# --------------------------------------------------------------------------- holdings math
def _t(side, qty, price, day, fee=0.0, sym="AAPL"):
    return holdings.Tx(sym, side, qty, price, fee, datetime(2026, 1, day, tzinfo=UTC))


def test_average_cost_realised_and_unrealised_pnl():
    book = holdings.replay([
        _t("buy", 10, 100, 1, fee=1), _t("buy", 10, 120, 2, fee=1), _t("sell", 5, 130, 3, fee=2),
    ])
    pos = book.positions["AAPL"]
    assert pos.average_cost == pytest.approx((10 * 100 + 1 + 10 * 120 + 1) / 20)  # 110.1
    assert pos.realized_pnl == pytest.approx((130 - 110.1) * 5 - 2)
    assert pos.quantity == 15
    val = holdings.valuation(book, {"AAPL": 140.0})
    row = val["positions"][0]
    assert row["unrealized_pnl"] == pytest.approx(15 * 140 - 15 * 110.1)
    assert val["totals"]["complete"] is True


def test_oversell_is_rejected_and_missing_price_is_not_zero():
    with pytest.raises(holdings.OversellError):
        holdings.replay([_t("buy", 5, 100, 1), _t("sell", 6, 110, 2)])
    # Order is by executed_at, not insertion: a back-dated buy covers a later sell.
    holdings.replay([_t("sell", 5, 110, 3), _t("buy", 5, 100, 1)])
    val = holdings.valuation(holdings.replay([_t("buy", 5, 100, 1)]), {})
    assert val["positions"][0]["unrealized_pnl"] is None
    assert val["totals"]["market_value"] is None and val["totals"]["complete"] is False


# --------------------------------------------------------------------------- cache contract
@pytest.mark.anyio
async def test_cache_fresh_then_stale_fallback_then_unavailable(redis):
    calls = {"n": 0}

    def ok():
        calls["n"] += 1
        return {"v": calls["n"]}

    env = await tcache.cached("k", ttl=60, fetch=ok, source="S", delay_note="D")
    assert env["data"] == {"v": 1} and env["stale"] is False
    env = await tcache.cached("k", ttl=60, fetch=ok, source="S", delay_note="D")
    assert calls["n"] == 1  # served fresh from cache

    def boom():
        raise RuntimeError("upstream down")

    env = await tcache.cached("k", ttl=0, fetch=boom, source="S", delay_note="D")
    assert env["data"] == {"v": 1} and env["stale"] is True  # last good value, marked stale
    with pytest.raises(tcache.SourceUnavailable):
        await tcache.cached("other", ttl=60, fetch=boom, source="S", delay_note="D")


@pytest.mark.anyio
async def test_cache_works_without_redis(monkeypatch):
    from app.clients import redis_client

    def broken():
        raise ConnectionError("redis down")

    monkeypatch.setattr(redis_client, "get_client", broken)
    env = await tcache.cached("x", ttl=60, fetch=lambda: [1, 2], source="S", delay_note="D")
    assert env["data"] == [1, 2] and env["stale"] is False


# --------------------------------------------------------------------------- parsers
_RSS = """<?xml version="1.0"?><rss><channel>
<item><title>Apple beats estimates - Reuters</title><link>https://example.com/a</link><source url="x">Reuters</source>
<pubDate>Mon, 28 Sep 2026 14:00:00 GMT</pubDate></item>
<item><title>Apple beats estimates</title><link>https://example.com/b</link><pubDate>Mon, 28 Sep 2026 13:00:00 GMT</pubDate></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>"""


def test_rss_parse_strips_publisher_dedupes_and_rejects_non_http_links():
    items = crypto_news._parse_rss(_RSS, "Google News")
    assert items[0]["title"] == "Apple beats estimates" and items[0]["publisher"] == "Reuters"
    assert all(i["link"].startswith("https://") for i in items)
    assert len({crypto_news._norm(i["title"]) for i in items}) == 1


def test_rss_parser_refuses_entity_expansion():
    bomb = """<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]>
<rss><channel><item><title>&lol2;</title><link>https://x.io</link></item></channel></rss>"""
    assert crypto_news._parse_rss(bomb, "X") == []  # defusedxml: rejected, not expanded


class _Resp:
    def __init__(self, status=200, body=b"", payload=None):
        self.status_code, self.content, self._payload = status, body, payload
        self.text = body.decode() if isinstance(body, bytes) else body
        self.ok = status < 400

    def json(self):
        return self._payload

    def raise_for_status(self):
        if not self.ok:
            raise RuntimeError(f"HTTP {self.status_code}")


_FORM4 = b"""<?xml version="1.0"?><ownershipDocument>
<reportingOwner><reportingOwnerId><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId>
<reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CFO</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction>
<transactionDate><value>2026-09-22</value></transactionDate>
<transactionCoding><transactionCode>S</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>1000</value></transactionShares>
<transactionPricePerShare><value>250.5</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
<postTransactionAmounts><sharesOwnedFollowingTransaction><value>5000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
</nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>"""


def test_sec_form4_parse_and_user_agent_required(monkeypatch):
    monkeypatch.setattr(settings, "SEC_EDGAR_USER_AGENT", None)
    with pytest.raises(tcache.SourceNotConfigured):
        official.sec_insider_transactions(320193)
    monkeypatch.setattr(settings, "SEC_EDGAR_USER_AGENT", "Test Co test@example.com")
    seen_headers = []

    def fake_get(url, headers=None, timeout=None, **kw):
        seen_headers.append(headers)
        if "submissions" in url:
            return _Resp(payload={"filings": {"recent": {
                "form": ["4", "10-Q"], "accessionNumber": ["0001-26-000001", "x"],
                "primaryDocument": ["xslF345X05/form4.xml", "q.htm"], "filingDate": ["2026-09-24", "2026-08-01"]}}})
        return _Resp(body=_FORM4)

    monkeypatch.setattr(official.requests, "get", fake_get)
    rows = official.sec_insider_transactions(320193)
    assert rows == [{
        "filing_date": "2026-09-24", "transaction_date": "2026-09-22", "owner": "Doe Jane", "title": "CFO",
        "is_director": False, "is_officer": True, "is_ten_percent_owner": False, "code": "S",
        "code_label": "Open-market sale", "acquired_disposed": "D", "shares": 1000.0, "price": 250.5,
        "value": 250500.0, "shares_after": 5000.0,
        "filing_url": "https://www.sec.gov/Archives/edgar/data/320193/000126000001/xslF345X05/form4.xml",
    }]
    assert all(h["User-Agent"] == "Test Co test@example.com" for h in seen_headers)


def test_finra_parse_and_missing_day(monkeypatch):
    body = "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market\n20260925|AAPL|500|10|1000|B,Q,N\n20260925||1|1|1|x\n"
    monkeypatch.setattr(official.requests, "get", lambda url, **kw: _Resp(body=body.encode()) if "0925" in url else _Resp(404))
    assert official.finra_short_volume_day(date(2026, 9, 25)) == {"AAPL": [500.0, 10.0, 1000.0]}
    assert official.finra_short_volume_day(date(2026, 9, 26)) is None


@pytest.mark.anyio
async def test_crypto_board_falls_back_to_binance_labelled(redis, monkeypatch):
    def cg_throttled():
        raise RuntimeError("HTTP 429")

    monkeypatch.setattr(crypto_news, "crypto_board", cg_throttled)
    monkeypatch.setattr(crypto_news, "binance_board", lambda: {"coins": [{"symbol": "BTC", "market_cap": None}], "global": None, "fallback": True})
    env = await market.crypto_board()
    assert "fallback" in env["source"] and env["data"]["coins"][0]["market_cap"] is None


# --------------------------------------------------------------------------- user data API
@pytest.mark.anyio
async def test_workspace_defaults_save_and_validation(client, db_session_factory, redis):
    _org_row, user = await _org(db_session_factory, "ws")
    ws = (await client.get("/terminal/workspace", headers=_token(user))).json()
    assert ws["active_symbol"] == "SPY" and {w["type"] for w in ws["widgets"]} >= {"chart", "quote"}
    body = {"widgets": [{"id": "c", "type": "chart", "config": {}}, {"id": "o", "type": "options", "config": {}}],
            "layout": [{"i": "c", "x": 0, "y": 0, "w": 8, "h": 10}, {"i": "gone", "x": 0, "y": 0, "w": 2, "h": 2}],
            "active_symbol": "nvda"}
    saved = (await client.put("/terminal/workspace", json=body, headers=_token(user))).json()
    assert saved["active_symbol"] == "NVDA" and [li["i"] for li in saved["layout"]] == ["c"]  # orphan dropped
    bad = await client.put("/terminal/workspace", json={**body, "widgets": [{"id": "x", "type": "rm -rf", "config": {}}]},
                           headers=_token(user))
    assert bad.status_code == 422


@pytest.mark.anyio
async def test_holdings_are_private_to_their_owner(client, db_session_factory, redis, monkeypatch):
    org, alice = await _org(db_session_factory, "hold")
    bob = await add_user_to_org(db_session_factory, organization_id=org.id, email="bob@hold.io", role=UserRole.ADMIN)
    p = (await client.post("/terminal/portfolios", json={"name": "Core", "cash": 1000}, headers=_token(alice))).json()
    url = f"/terminal/portfolios/{p['id']}"
    t0 = datetime(2026, 9, 1, tzinfo=UTC).isoformat()
    t1 = datetime(2026, 9, 2, tzinfo=UTC).isoformat()
    r = await client.post(f"{url}/transactions", json={"symbol": "aapl", "side": "buy", "quantity": 10, "price": 100,
                                                        "fee": 1, "executed_at": t0}, headers=_token(alice))
    assert r.status_code == 201 and r.json()["symbol"] == "AAPL"
    buy_id = r.json()["id"]
    over = await client.post(f"{url}/transactions", json={"symbol": "AAPL", "side": "sell", "quantity": 11,
                                                           "price": 120, "executed_at": t1}, headers=_token(alice))
    assert over.status_code == 422 and "exceeds" in over.json()["detail"]
    await client.post(f"{url}/transactions", json={"symbol": "AAPL", "side": "sell", "quantity": 4, "price": 120,
                                                    "executed_at": t1}, headers=_token(alice))
    # Deleting the buy would orphan the sale -> refused.
    assert (await client.delete(f"{url}/transactions/{buy_id}", headers=_token(alice))).status_code == 422

    async def fake_quotes(symbols):
        return {"data": [{"symbol": "AAPL", "last": 130.0}]}

    monkeypatch.setattr(market, "quotes", fake_quotes)
    pos = (await client.get(f"{url}/positions", headers=_token(alice))).json()
    row = pos["positions"][0]
    assert row["quantity"] == 6 and row["average_cost"] == pytest.approx(100.1)
    assert row["realized_pnl"] == pytest.approx((120 - 100.1) * 4)
    assert row["unrealized_pnl"] == pytest.approx(6 * 130 - 6 * 100.1)

    # Bob is an Admin in the same org — and still cannot see or touch Alice's book.
    assert (await client.get("/terminal/portfolios", headers=_token(bob))).json() == []
    assert (await client.get(f"{url}/positions", headers=_token(bob))).status_code == 404
    assert (await client.delete(url, headers=_token(bob))).status_code == 404
    # And another org cannot either.
    _o2, eve = await _org(db_session_factory, "hold-other")
    assert (await client.get(f"{url}/transactions", headers=_token(eve))).status_code == 404


@pytest.mark.anyio
async def test_watchlists_default_crud_and_validation(client, db_session_factory, redis):
    _org_row, user = await _org(db_session_factory, "wl")
    lists = (await client.get("/terminal/watchlists", headers=_token(user))).json()
    assert lists[0]["name"] == "Default" and "SPY" in lists[0]["symbols"]
    wid = lists[0]["id"]
    upd = await client.patch(f"/terminal/watchlists/{wid}", json={"symbols": ["tsla", "TSLA", "0700.hk"]}, headers=_token(user))
    assert upd.json()["symbols"] == ["TSLA", "0700.HK"]
    bad = await client.patch(f"/terminal/watchlists/{wid}", json={"symbols": ["../etc"]}, headers=_token(user))
    assert bad.status_code == 422
    assert (await client.delete(f"/terminal/watchlists/{wid}", headers=_token(user))).status_code == 204


@pytest.mark.anyio
async def test_price_alert_fires_once_notifies_owner_and_publishes(client, db_session_factory, redis):
    org, user = await _org(db_session_factory, "alert")
    a = (await client.post("/terminal/alerts", json={"symbol": "NVDA", "condition": "above", "target_price": 200},
                           headers=_token(user))).json()
    b = (await client.post("/terminal/alerts", json={"symbol": "NVDA", "condition": "below", "target_price": 100},
                           headers=_token(user))).json()
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        assert await userdata.evaluate_org_alerts(session, org.id, {"NVDA": 150.0}) == 0
        assert await userdata.evaluate_org_alerts(session, org.id, {"NVDA": 201.5}) == 1
        assert await userdata.evaluate_org_alerts(session, org.id, {"NVDA": 250.0}) == 0  # already triggered
        rows = {str(r.id): r for r in (await session.execute(select(PriceAlert))).scalars().all()}
        assert rows[a["id"]].status == PriceAlertStatus.TRIGGERED and rows[a["id"]].triggered_price == 201.5
        assert rows[b["id"]].status == PriceAlertStatus.ACTIVE
        notes = (await session.execute(select(Notification))).scalars().all()
        assert [n.type for n in notes] == [NotificationType.PRICE_ALERT] and notes[0].user_id == user.id
    events = [json.loads(m)["payload"] for _c, m in redis.published]
    assert events[-1]["type"] == "price_alert" and events[-1]["target_user_ids"] == [str(user.id)]
    cancelled = await client.delete(f"/terminal/alerts/{b['id']}", headers=_token(user))
    assert cancelled.json()["status"] == "cancelled"


@pytest.mark.anyio
async def test_alert_limit(client, db_session_factory, redis, monkeypatch):
    monkeypatch.setattr(userdata, "MAX_ACTIVE_ALERTS", 2)
    _org_row, user = await _org(db_session_factory, "alimit")
    for _ in range(2):
        r = await client.post("/terminal/alerts", json={"symbol": "SPY", "condition": "below", "target_price": 1}, headers=_token(user))
        assert r.status_code == 201
    r = await client.post("/terminal/alerts", json={"symbol": "SPY", "condition": "below", "target_price": 1}, headers=_token(user))
    assert r.status_code == 422


# --------------------------------------------------------------------------- global API error mapping
@pytest.mark.anyio
async def test_source_errors_map_to_clean_statuses(client, db_session_factory, redis, monkeypatch):
    _org_row, user = await _org(db_session_factory, "errs")

    async def not_configured(symbol):
        raise tcache.SourceNotConfigured("SEC_EDGAR_USER_AGENT is not set")

    async def down(symbol):
        raise tcache.SourceUnavailable("Yahoo is unavailable right now")

    async def unknown(symbol):
        raise LookupError("no quote for ZZZZ")

    async def bug(symbol):
        return {}["missing"]

    monkeypatch.setattr(market, "insider", not_configured)
    assert (await client.get("/terminal/insider/AAPL", headers=_token(user))).status_code == 503
    monkeypatch.setattr(market, "quote_detail", down)
    assert (await client.get("/terminal/quote/AAPL", headers=_token(user))).status_code == 502
    monkeypatch.setattr(market, "quote_detail", unknown)
    assert (await client.get("/terminal/quote/ZZZZ", headers=_token(user))).status_code == 404
    monkeypatch.setattr(market, "quote_detail", bug)
    with pytest.raises(KeyError):  # a real bug is not disguised as "not found"
        await client.get("/terminal/quote/AAPL", headers=_token(user))
    assert (await client.get("/terminal/history/AAPL?range=2H", headers=_token(user))).status_code == 422
    assert (await client.get("/terminal/quote/..%2Fetc", headers=_token(user))).status_code in (404, 422)
    assert (await client.get("/terminal/status")).status_code == 401  # authenticated only


@pytest.mark.anyio
async def test_options_payload_adds_greeks_and_no_quote_is_none(redis, monkeypatch):
    from app.terminal.sources import yahoo

    expiry = (datetime.now(UTC).date() + timedelta(days=30)).isoformat()
    monkeypatch.setattr(yahoo, "option_expirations", lambda s: [expiry])
    monkeypatch.setattr(yahoo, "option_chain", lambda s, e: {
        "symbol": s, "expiration": e, "underlying_price": 100.0,
        "calls": [{"contract": "C", "strike": 100.0, "last": 2.5, "bid": 2.4, "ask": 2.6, "volume": 10,
                   "open_interest": 5, "implied_volatility": 0.25, "in_the_money": False, "last_trade": None}],
        "puts": [{"contract": "P", "strike": 100.0, "last": 2.4, "bid": None, "ask": None, "volume": 0,
                  "open_interest": 0, "implied_volatility": 0.25, "in_the_money": False, "last_trade": None}],
    })
    monkeypatch.setattr(settings, "FRED_API_KEY", None)
    env = await market.options("AAPL", None)
    d = env["data"]
    assert d["risk_free_source"].startswith("configured default")
    assert 0.45 < d["calls"][0]["greeks"]["delta"] < 0.6 and d["calls"][0]["mid"] == 2.5
    assert d["puts"][0]["greeks"]["delta"] < 0 and d["puts"][0]["mid"] is None


# --------------------------------------------------------------------------- Agent Desk link
@pytest.mark.anyio
async def test_agent_desk_uses_own_holdings_portfolio(client, db_session_factory, redis, monkeypatch):
    from app.agents import runner
    from app.worker import tasks

    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "google")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(runner, "normalize_ticker", lambda t: t.upper())

    class _R:
        id = "t"

    monkeypatch.setattr(tasks.run_agent_analysis_task, "delay", lambda **kw: _R())
    org, alice = await _org(db_session_factory, "deskbook")
    bob = await add_user_to_org(db_session_factory, organization_id=org.id, email="bob@deskbook.io", role=UserRole.RESEARCHER)
    p = (await client.post("/terminal/portfolios", json={"name": "Book", "cash": 5000, "base_currency": "usd"},
                           headers=_token(alice))).json()
    await client.post(f"/terminal/portfolios/{p['id']}/transactions", json={
        "symbol": "NVDA", "side": "buy", "quantity": 20, "price": 150, "executed_at": "2026-09-01T00:00:00Z"},
        headers=_token(alice))
    resp = await client.post("/agents/analyses", json={"ticker": "NVDA", "trade_date": "2026-09-25",
                                                        "holdings_portfolio_id": p["id"]}, headers=_token(alice))
    assert resp.status_code == 202, resp.text
    detail = (await client.get(f"/agents/analyses/{resp.json()['analysis_id']}", headers=_token(alice))).json()
    assert detail["portfolio"] == {"cash": 5000.0, "currency": "USD",
                                   "positions": [{"ticker": "NVDA", "quantity": 20.0, "average_price": 150.0}]}
    theft = await client.post("/agents/analyses", json={"ticker": "NVDA", "holdings_portfolio_id": p["id"]},
                              headers=_token(bob))
    assert theft.status_code == 404
    both = await client.post("/agents/analyses", json={"ticker": "NVDA", "holdings_portfolio_id": p["id"],
                                                        "portfolio": {"positions": []}}, headers=_token(alice))
    assert both.status_code == 422


# --------------------------------------------------------------------------- terminal chat context
@pytest.mark.anyio
async def test_chat_context_includes_quote_regime_and_headlines(db_session_factory, redis, monkeypatch):
    from app.api.routes import llm as llm_routes

    org, _user = await _org(db_session_factory, "ctx")

    async def fake_quote(symbol):
        return {"data": {"last": 180.5, "change_pct": 1.2, "pe_ratio": 40.1, "sector": "Technology", "industry": "Semis"}}

    async def fake_news(symbol, q):
        return {"data": [{"title": "Chip demand surges", "publisher": "Reuters", "published_at": "2026-09-28"}]}

    monkeypatch.setattr(market, "quote_detail", fake_quote)
    monkeypatch.setattr(market, "news", fake_news)
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        session.add(RegimeLabelRecord(symbol="NVDA", timestamp=datetime(2026, 9, 25, tzinfo=UTC),
                                      regime_label=RegimeLabel.BULL, confidence_score=0.81, model_votes={}))
        await session.commit()
        text = await llm_routes._terminal_context(session, "NVDA")
    assert "Last 180.5" in text and "P/E 40.1" in text
    assert "Stellix regime: Bull (confidence 0.81" in text
    assert "Chip demand surges" in text


@pytest.mark.anyio
async def test_price_guard_still_applies_with_context_symbol(client, db_session_factory, redis):
    _org_row, user = await _org(db_session_factory, "ctxguard")
    resp = await client.post("/llm/chat/stream", json={"message": "What is your price target for NVDA?", "context_symbol": "NVDA"},
                             headers=_token(user))
    assert resp.status_code == 400  # Safeguard 1 unchanged


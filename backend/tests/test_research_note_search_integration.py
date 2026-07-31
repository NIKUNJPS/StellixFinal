"""Real Postgres full-text search (Batch 10): genuine tsvector/ts_rank relevance,
plus websearch_to_tsquery syntax (quoted phrases, exclusion) — none of which the
SQLite ILIKE fallback in test_research_note_search.py can exercise.

Opt-in (needs a live DB): RUN_INTEGRATION=1.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from app.core.security import hash_password
from app.db.session import dispose_engine, get_system_session, get_tenant_session
from app.models.organization import Organization, OrganizationTier
from app.models.research_note import ResearchNote
from app.models.user import User, UserRole
from app.services.research_note import list_notes

pytestmark = pytest.mark.integration


def _search_after_seeding(query: str) -> list[str]:
    """Seed one org + 3 notes and run one search, all on a single event loop (a
    fresh asyncpg pool per asyncio.run() must be disposed on the SAME loop that
    created it, or connection teardown crashes against an already-closed loop)."""
    slug = "search-int-" + uuid.uuid4().hex[:8]

    async def _run() -> list[str]:
        try:
            async with get_system_session() as s:
                org = Organization(
                    name="Search Integration Co", slug=slug, tier=OrganizationTier.STARTER,
                    max_strategies=25, is_active=True,
                )
                s.add(org)
                await s.flush()
                org_id = org.id
                user = User(
                    organization_id=org_id, email=f"{slug}@search-int.io",
                    hashed_password=hash_password("supersecret1"), full_name=None,
                    role=UserRole.RESEARCHER, is_active=True,
                )
                s.add(user)
                await s.flush()
                author_id = user.id

            async with get_tenant_session(org_id) as s:
                s.add_all(
                    [
                        ResearchNote(
                            title="RSI Mean Reversion Hypothesis",
                            content="Investigating whether RSI oversold signals produce reliable mean-reversion entries during low-volatility regimes.",
                            hypothesis="RSI below 30 in a low-vol regime predicts a bounce within 5 days",
                            author_user_id=author_id,
                        ),
                        ResearchNote(
                            title="GARCH Volatility Clustering Review",
                            content="Reviewing whether GARCH conditional volatility clusters ahead of Crisis regime transitions.",
                            hypothesis="Rising GARCH conditional volatility precedes a Crisis regime label",
                            author_user_id=author_id,
                        ),
                        ResearchNote(
                            title="Dead end on moving average crossovers",
                            content="Simple SMA crossover entries showed no edge after transaction costs across all tested regimes.",
                            author_user_id=author_id,
                        ),
                    ]
                )

            async with get_tenant_session(org_id) as s:
                _total, rows = await list_notes(
                    s, status_filter=None, tag=None, author_user_id=None,
                    start_date=None, end_date=None, query=query, limit=50, offset=0,
                )
                return [r.title for r in rows]
        finally:
            await dispose_engine()

    return asyncio.run(_run())


def test_plain_term_returns_only_the_relevant_note():
    titles = _search_after_seeding("RSI")
    assert titles == ["RSI Mean Reversion Hypothesis"]


def test_unrelated_term_is_excluded():
    titles = _search_after_seeding("nonexistentxyzterm")
    assert titles == []


def test_shared_term_ranks_the_more_central_match_first():
    """Both the RSI note ("low-volatility regimes") and the GARCH note are genuinely
    about "volatility" — real ts_rank should put the GARCH note (title AND content
    both centrally about volatility) ahead of the RSI note (one passing mention)."""
    titles = _search_after_seeding("volatility")
    assert titles[0] == "GARCH Volatility Clustering Review"
    assert "RSI Mean Reversion Hypothesis" in titles


def test_websearch_quoted_phrase_syntax():
    titles = _search_after_seeding('"mean reversion"')
    assert titles == ["RSI Mean Reversion Hypothesis"]


def test_websearch_exclusion_syntax():
    """"regime -garch" should match every note mentioning "regime" except the GARCH
    one — plainto_tsquery has no such syntax; websearch_to_tsquery does."""
    titles = _search_after_seeding("regime -garch")
    assert "GARCH Volatility Clustering Review" not in titles
    assert set(titles) == {"RSI Mean Reversion Hypothesis", "Dead end on moving average crossovers"}

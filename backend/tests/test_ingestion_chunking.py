"""Regression test for the asyncpg 32767 bound-parameter limit in bulk inserts.

A multi-year daily series (crypto trades 365 days/yr) or any intraday series can
push a single INSERT past PostgreSQL's hard cap of 32767 bound parameters
(param_count = rows × columns). `persist_features`/`persist_market_data` chunk via
`_chunk_rows` to stay under it. These are pure-function unit tests (no DB).
"""

from __future__ import annotations

from app.services.ingestion import _PG_MAX_PARAMS, _chunk_rows

# feature_matrix is the widest writer: organization_id, symbol, timestamp,
# features (JSONB) + 13 indicator columns = 17 bound params per row.
FEATURE_COLS = 17
PG_HARD_LIMIT = 32767


def _rows(n: int, cols: int) -> list[dict]:
    return [{f"c{j}": i for j in range(cols)} for i in range(n)]


def test_empty_input_returns_no_chunks():
    assert _chunk_rows([]) == []


def test_small_input_stays_single_chunk():
    rows = _rows(50, FEATURE_COLS)
    chunks = _chunk_rows(rows)
    assert len(chunks) == 1
    assert chunks[0] == rows


def test_btc_sized_feature_insert_is_chunked_under_the_limit():
    # ~2171 daily BTC-USD bars × 17 columns = 36,907 params in one statement,
    # which is what used to blow past asyncpg's 32767 cap.
    rows = _rows(2171, FEATURE_COLS)
    assert len(rows) * FEATURE_COLS > PG_HARD_LIMIT  # would have failed unchunked

    chunks = _chunk_rows(rows)
    assert len(chunks) > 1
    # No chunk may exceed the hard wire-protocol limit.
    for chunk in chunks:
        assert len(chunk) * FEATURE_COLS <= _PG_MAX_PARAMS <= PG_HARD_LIMIT
    # Every row is preserved exactly once, in order.
    flattened = [r for chunk in chunks for r in chunk]
    assert flattened == rows


def test_chunk_size_derives_from_the_widest_row():
    # Heterogeneous rows: sizing off the widest row keeps even the widest chunk safe.
    rows = _rows(5000, 9) + [{f"c{j}": 1 for j in range(FEATURE_COLS)}]
    for chunk in _chunk_rows(rows):
        max_cols = max(len(r) for r in chunk)
        assert len(chunk) * max_cols <= PG_HARD_LIMIT

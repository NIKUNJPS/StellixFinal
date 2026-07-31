"""CSV OHLCV upload — validate-then-confirm (Batch 21).

Hermetic: seeded orgs, real local Redis for the upload stash, no live network calls.
The suite proves the CSV path REUSES the existing yfinance validators
(app/services/ingestion.py) rather than a second divergent one.
"""

from __future__ import annotations

from tests.helpers import bearer, register_org


def _csv(rows: list[tuple[str, float, float, float, float, int]], header: list[str] | None = None) -> bytes:
    """Build CSV bytes from (date, open, high, low, close, volume) rows."""
    head = header or ["date", "open", "high", "low", "close", "volume"]
    lines = [",".join(head)]
    for d, o, h, low, c, v in rows:
        lines.append(f"{d},{o},{h},{low},{c},{v}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _clean_rows(n: int = 8) -> list[tuple[str, float, float, float, float, int]]:
    rows = []
    base = 100.0
    for i in range(n):
        o = base + i
        c = o + 0.5
        h = c + 1.0      # high is the max
        low = o - 1.0    # low is the min
        rows.append((f"2024-01-{i + 1:02d}", o, h, low, c, 1_000_000 + i))
    return rows


async def _upload(client, token, csv_bytes, *, symbol="AAPL", interval="1d", data_extra=None):
    data = {"symbol": symbol, "interval": interval, **(data_extra or {})}
    return await client.post(
        "/data/upload-csv",
        data=data,
        files={"file": ("data.csv", csv_bytes, "text/csv")},
        headers=bearer(token),
    )


async def test_upload_csv_with_bad_ohlc_returns_422(client, db_session_factory):
    token, _org = await register_org(client, org_name="CsvBad", email="bad@csv.co")
    rows = _clean_rows(5)
    # Corrupt one row: high < low (row index 2 -> data row 3).
    d, o, _h, _low, c, v = rows[2]
    rows[2] = (d, o, 90.0, 110.0, c, v)  # high=90 < low=110

    resp = await _upload(client, token, _csv(rows))
    assert resp.status_code == 422, resp.text
    report = resp.json()
    assert report["error_count"] >= 1
    assert report["total_rows"] == 5
    # The offending row is flagged with a high/low message, and nothing was stashed.
    assert any(e["row"] == 3 and e["column"] in ("high", "low") for e in report["errors"])
    assert "upload_id" not in report


async def test_upload_csv_clean_returns_report_with_preview(client, db_session_factory):
    token, _org = await register_org(client, org_name="CsvClean", email="clean@csv.co")
    resp = await _upload(client, token, _csv(_clean_rows(8)))
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["error_count"] == 0
    assert report["total_rows"] == 8
    assert report["valid_rows"] == 8
    assert len(report["preview"]) == 5           # first 5 rows
    assert report["preview"][0]["open"] == 100.0
    assert report["date_range"]["start"] is not None
    assert report["date_range"]["end"] is not None
    assert "upload_id" in report and report["upload_id"]


async def test_confirm_inserts_bars_into_db(client, db_session_factory):
    token, _org = await register_org(client, org_name="CsvConfirm", email="confirm@csv.co")
    up = await _upload(client, token, _csv(_clean_rows(8)), symbol="MSFT")
    assert up.status_code == 200, up.text
    upload_id = up.json()["upload_id"]

    confirm = await client.post(
        "/data/upload-csv/confirm", json={"upload_id": upload_id}, headers=bearer(token)
    )
    assert confirm.status_code == 200, confirm.text
    body = confirm.json()
    assert body["inserted"] == 8
    assert body["symbol"] == "MSFT"
    assert body["interval"] == "1d"

    # The bars are actually queryable back through the same tenant-scoped read.
    market = await client.get("/data/market/MSFT", headers=bearer(token))
    assert market.status_code == 200
    assert market.json()["count"] == 8


async def test_confirm_rejects_cross_org_upload_id(client, db_session_factory):
    token_a, _a = await register_org(client, org_name="CsvOrgA", email="a@csvorg.co")
    token_b, _b = await register_org(client, org_name="CsvOrgB", email="b@csvorg.co")

    up = await _upload(client, token_a, _csv(_clean_rows(6)), symbol="TSLA")
    upload_id = up.json()["upload_id"]

    # Org B tries to confirm Org A's upload_id — the key is namespaced by org, so
    # it misses: 410, and no bars land in Org B.
    confirm_b = await client.post(
        "/data/upload-csv/confirm", json={"upload_id": upload_id}, headers=bearer(token_b)
    )
    assert confirm_b.status_code == 410

    market_b = await client.get("/data/market/TSLA", headers=bearer(token_b))
    assert market_b.json()["count"] == 0

    # Org A can still confirm its own upload.
    confirm_a = await client.post(
        "/data/upload-csv/confirm", json={"upload_id": upload_id}, headers=bearer(token_a)
    )
    assert confirm_a.status_code == 200
    assert confirm_a.json()["inserted"] == 6


async def test_upload_reuses_existing_validation(client, db_session_factory, monkeypatch):
    """The CSV clean path must run the SAME validator the yfinance ingest uses
    (validate_and_clean), not a fork of it."""
    import app.services.csv_upload as csv_mod

    calls = {"n": 0}
    real = csv_mod.validate_and_clean

    def _spy(df, interval):
        calls["n"] += 1
        return real(df, interval)

    monkeypatch.setattr(csv_mod, "validate_and_clean", _spy)

    token, _org = await register_org(client, org_name="CsvReuse", email="reuse@csv.co")
    resp = await _upload(client, token, _csv(_clean_rows(8)))
    assert resp.status_code == 200, resp.text
    assert calls["n"] == 1  # the shared yfinance validator was invoked

"""Official public-sector sources: SEC EDGAR, FINRA Reg SHO, ECB Data Portal.

* SEC asks every caller to identify itself with a contact in the User-Agent and allows
  up to 10 requests/second. ``SEC_EDGAR_USER_AGENT`` is therefore a deferred credential:
  without it these functions raise ``SourceNotConfigured`` rather than send anonymous
  traffic. https://www.sec.gov/os/accessing-edgar-data
* FINRA publishes one short-sale-volume file per trading day, free, no key.
* The ECB Data Portal API is the ECB's official, documented statistics API.
"""

from __future__ import annotations

import csv
import io
from datetime import date, timedelta

import requests
from defusedxml import ElementTree as ET

from app.core.config import settings
from app.terminal.cache import SourceNotConfigured

_TIMEOUT = 20


# ----------------------------------------------------------------------------- SEC
def _sec_headers() -> dict:
    agent = (settings.SEC_EDGAR_USER_AGENT or "").strip()
    if not agent:
        raise SourceNotConfigured(
            "SEC_EDGAR_USER_AGENT is not set. SEC requires callers to identify themselves "
            "(e.g. 'Your Firm research@yourfirm.com')."
        )
    return {"User-Agent": agent, "Accept-Encoding": "gzip, deflate"}


def sec_configured() -> bool:
    return bool((settings.SEC_EDGAR_USER_AGENT or "").strip())


def sec_company_tickers() -> dict[str, dict]:
    """ticker -> {cik, name} for every SEC registrant with a ticker (~10k)."""
    r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=_sec_headers(), timeout=_TIMEOUT)
    r.raise_for_status()
    out = {}
    for row in r.json().values():
        out[str(row["ticker"]).upper().replace(".", "-")] = {"cik": int(row["cik_str"]), "name": row["title"]}
    return out


def _recent_quarters(n: int = 4) -> list[str]:
    today = date.today()
    y, q = today.year, (today.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        out.append(f"CY{y}Q{q}I")
        y, q = (y, q - 1) if q > 1 else (y - 1, 4)
    return out


def sec_shares_outstanding() -> dict[int, dict]:
    """cik -> {shares, as_of} from XBRL frames (dei:EntityCommonStockSharesOutstanding),
    newest quarter first, older quarters only filling companies not yet reported."""
    out: dict[int, dict] = {}
    for frame in _recent_quarters():
        r = requests.get(
            f"https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/{frame}.json",
            headers=_sec_headers(), timeout=_TIMEOUT,
        )
        if r.status_code == 404:
            continue  # the current quarter's frame may not exist yet
        r.raise_for_status()
        for row in r.json().get("data", []):
            cik = int(row["cik"])
            if cik not in out and row.get("val"):
                out[cik] = {"shares": float(row["val"]), "as_of": row.get("end")}
    return out


_FORM4_CODES = {
    "P": "Open-market purchase", "S": "Open-market sale", "A": "Grant / award", "M": "Option exercise",
    "F": "Tax withholding", "G": "Gift", "D": "Disposition to issuer", "C": "Conversion",
    "X": "Option exercise (in the money)", "J": "Other",
}


def _text(node, path: str) -> str | None:
    found = node.find(path)
    return found.text.strip() if found is not None and found.text else None


def sec_insider_transactions(cik: int, limit_filings: int = 15) -> list[dict]:
    headers = _sec_headers()
    sub = requests.get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json", headers=headers, timeout=_TIMEOUT)
    sub.raise_for_status()
    recent = sub.json()["filings"]["recent"]
    rows = []
    picked = 0
    for form, acc, doc, filed in zip(recent["form"], recent["accessionNumber"], recent["primaryDocument"],
                                     recent["filingDate"], strict=False):
        if form != "4":
            continue
        picked += 1
        if picked > limit_filings:
            break
        # primaryDocument is the XSL-rendered path (xslF345X05/...); the raw XML is its basename.
        xml_name = doc.split("/")[-1]
        url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{xml_name}"
        res = requests.get(url, headers=headers, timeout=_TIMEOUT)
        if not res.ok:
            continue
        try:
            root = ET.fromstring(res.content)
        except (ET.ParseError, ValueError):
            continue
        owner = root.find("reportingOwner")
        rel = owner.find("reportingOwnerRelationship") if owner is not None else None
        name = _text(owner, "reportingOwnerId/rptOwnerName") if owner is not None else None
        title = _text(rel, "officerTitle") if rel is not None else None
        flags = {k: (_text(rel, k) or "0") in ("1", "true") for k in ("isDirector", "isOfficer", "isTenPercentOwner")} if rel is not None else {}
        for tx in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
            shares = _float(_text(tx, "transactionAmounts/transactionShares/value"))
            price = _float(_text(tx, "transactionAmounts/transactionPricePerShare/value"))
            code = _text(tx, "transactionCoding/transactionCode")
            rows.append(
                {
                    "filing_date": filed,
                    "transaction_date": _text(tx, "transactionDate/value"),
                    "owner": name,
                    "title": title,
                    "is_director": flags.get("isDirector", False),
                    "is_officer": flags.get("isOfficer", False),
                    "is_ten_percent_owner": flags.get("isTenPercentOwner", False),
                    "code": code,
                    "code_label": _FORM4_CODES.get(code or "", code),
                    "acquired_disposed": _text(tx, "transactionAmounts/transactionAcquiredDisposedCode/value"),
                    "shares": shares,
                    "price": price if price else None,
                    "value": shares * price if shares and price else None,
                    "shares_after": _float(_text(tx, "postTransactionAmounts/sharesOwnedFollowingTransaction/value")),
                    "filing_url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{doc}",
                }
            )
    return rows


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except ValueError:
        return None


# ----------------------------------------------------------------------------- FINRA
def finra_short_volume_day(day: date) -> dict[str, list[float]] | None:
    """symbol -> [short, short_exempt, total] for one trading day, or None if FINRA has
    no file for that date (weekend, holiday, or not yet published)."""
    url = f"https://cdn.finra.org/equity/regsho/daily/CNMSshvol{day:%Y%m%d}.txt"
    r = requests.get(url, headers={"User-Agent": "Stellix Labs market terminal"}, timeout=_TIMEOUT)
    if r.status_code in (403, 404):
        return None
    r.raise_for_status()
    out: dict[str, list[float]] = {}
    for line in r.text.strip().splitlines()[1:]:
        parts = line.split("|")
        if len(parts) < 5 or not parts[1]:
            continue
        try:
            out[parts[1]] = [float(parts[2]), float(parts[3] or 0), float(parts[4])]
        except ValueError:
            continue
    return out or None


def recent_business_days(n: int, *, end: date | None = None) -> list[date]:
    day = end or date.today()
    out = []
    while len(out) < n:
        if day.weekday() < 5:
            out.append(day)
        day -= timedelta(days=1)
    return out


# ----------------------------------------------------------------------------- ECB
ECB_SERIES = {
    "deposit_facility": ("FM", "D.U2.EUR.4F.KR.DFR.LEV", "ECB deposit facility rate"),
    "main_refinancing": ("FM", "D.U2.EUR.4F.KR.MRR_FR.LEV", "ECB main refinancing rate"),
    "marginal_lending": ("FM", "D.U2.EUR.4F.KR.MLFR.LEV", "ECB marginal lending facility rate"),
    "euro_area_10y": ("YC", "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y", "Euro area 10Y yield (AAA sovereign curve)"),
}


def ecb_latest(key: str) -> dict:
    flow, series, label = ECB_SERIES[key]
    r = requests.get(
        f"https://data-api.ecb.europa.eu/service/data/{flow}/{series}",
        params={"format": "csvdata", "lastNObservations": 1},
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(r.text)))
    if not rows:
        raise LookupError(f"ECB returned no observations for {series}")
    last = rows[-1]
    return {"key": key, "label": label, "value": _float(last.get("OBS_VALUE")), "date": last.get("TIME_PERIOD")}

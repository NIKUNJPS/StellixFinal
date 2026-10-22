"""Build a source ZIP of the repository for external review, excluding secrets and bulky/local data.

  * Excludes: .git, .env (any), .venv, node_modules, .next, __pycache__, var/ (local data incl. cached price
    data, which is under Yahoo's terms), logs, coverage output, the ZIP itself.
  * Scans every included text file for credential patterns and writes a findings report next to the ZIP.
    The scan NEVER prints a matched value, only file, line and pattern name.
  * Refuses to build if a high-confidence real secret pattern (API keys / private keys) is found.
  * REDACTS the demo credentials defined in scripts/seed_demo_data.py (admin / superadmin passwords and any
    other literal seed password) from every text file in the ZIP copy; the repository itself is not modified.

Usage: backend\\.venv\\Scripts\\python.exe scripts\\evaluation\\make_submission_zip.py [output.zip]
"""
from __future__ import annotations

import os
import re
import sys
import zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXCLUDE_DIRS = {".git", ".venv", "venv", "node_modules", ".next", "__pycache__", ".pytest_cache", ".mypy_cache",
                "var", "coverage", ".turbo", "dist", "build", ".idea", ".vscode-test", "htmlcov"}
EXCLUDE_FILES = re.compile(r"(^\.env(\..*)?$)|(\.pyc$)|(\.log$)|(\.sqlite3?$)|(\.db$)|(\.pem$)|(\.key$)|(^id_rsa)", re.I)
KEEP_ENV_TEMPLATES = {".env.example", ".env.sample", ".env.template"}
TEXT_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".md", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".txt",
            ".ps1", ".sh", ".sql", ".html", ".css", ".env", ".example", ".bib", ".csv"}

# (name, regex, blocks_the_build)
PATTERNS = [
    ("anthropic_api_key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"), True),
    ("google_ai_studio_key", re.compile(r"AIza[0-9A-Za-z_\-]{35}"), True),
    ("google_cloud_style_key", re.compile(r"\bAQ\.[A-Za-z0-9_\-]{30,}"), True),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), True),
    ("private_key_block", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"), True),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"), True),
    ("long_secret_assignment", re.compile(r"(?i)\b(secret|token|api[_-]?key|password)\w*\s*[:=]\s*['\"][A-Za-z0-9_\-/+]{24,}['\"]"), False),
    ("hardcoded_password_literal", re.compile(r"(?i)\bpassword\w*\s*=\s*['\"][^'\"\s]{6,}['\"]"), False),
]


def demo_credentials() -> set[str]:
    """Literal demo passwords from the seed script (values only used to scrub the ZIP copy, never printed)."""
    seed = os.path.join(ROOT, "scripts", "seed_demo_data.py")
    vals: set[str] = set()
    try:
        text = open(seed, encoding="utf-8").read()
    except OSError:
        return vals
    for m in re.finditer(r'(?m)^\s*[A-Z_]*PASSWORD\s*=\s*"([^"]{6,})"', text):
        vals.add(m.group(1))
    # password literals in the USERS list: ("email", "Name", UserRole.X, "password"),
    for line in text.splitlines():
        if "UserRole." in line:
            m = re.search(r'UserRole\.\w+,\s*"([^"\s]{8,})"', line)
            if m:
                vals.add(m.group(1))
    return vals


def included_files(out_abs: str):
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f in KEEP_ENV_TEMPLATES:
                yield os.path.join(base, f)
                continue
            if EXCLUDE_FILES.search(f):
                continue
            p = os.path.join(base, f)
            if os.path.abspath(p) == out_abs:
                continue
            yield p


def main() -> int:
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), f"StellixLabs_review_{date.today():%Y%m%d}.zip")
    out_abs = os.path.abspath(out)
    files = list(included_files(out_abs))
    creds = demo_credentials()
    findings: list[tuple[str, int, str, bool]] = []
    redacted_files: dict[str, int] = {}
    cache: dict[str, str] = {}

    def is_text(p: str) -> bool:
        return os.path.splitext(p)[1].lower() in TEXT_EXT or os.path.basename(p) in KEEP_ENV_TEMPLATES

    for p in files:
        if not is_text(p):
            continue
        try:
            text = open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        hits = 0
        for c in creds:
            hits += text.count(c)
            text = text.replace(c, "<REDACTED-DEMO-CREDENTIAL>")
        if hits:
            redacted_files[os.path.relpath(p, ROOT)] = hits
        if hits:
            cache[p] = text  # only rewrite files that actually contained a credential
        for n, line in enumerate(text.splitlines(), 1):
            for name, rx, blocks in PATTERNS:
                if rx.search(line):
                    findings.append((os.path.relpath(p, ROOT), n, name, blocks))
    report = out_abs[:-4] + "_secret_scan.txt"
    with open(report, "w", encoding="utf-8") as fh:
        fh.write(f"Secret scan of {len(files)} files (values are never written here)\n\n")
        for rel, n, name, blocks in findings:
            fh.write(f"{'BLOCKING' if blocks else 'review  '}  {rel}:{n}  {name}\n")
        if not findings:
            fh.write("no findings\n")
        fh.write(f"\nDemo credentials redacted from {len(redacted_files)} file(s) in the ZIP copy (names only):\n")
        for rel, n in sorted(redacted_files.items()):
            fh.write(f"  {rel}  ({n} occurrence(s))\n")
    blocking = [f for f in findings if f[3]]
    print(f"{len(files)} files; {len(findings)} findings ({len(blocking)} blocking). Report: {report}")
    if blocking:
        print("Refusing to build the ZIP: blocking secret patterns found (see report).")
        return 2
    with zipfile.ZipFile(out_abs, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for p in files:
            arc = os.path.join("StellixLabsMain", os.path.relpath(p, ROOT))
            if p in cache:
                zf.writestr(arc, cache[p])
            else:
                zf.write(p, arcname=arc)
    print(f"Wrote {out_abs} ({os.path.getsize(out_abs) / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

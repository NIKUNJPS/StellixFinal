"""Check the LLM keys in backend/.env and (optionally) switch which provider the platform uses.

    backend\\.venv\\Scripts\\python.exe scripts\\llm_setup.py                 # test only
    backend\\.venv\\Scripts\\python.exe scripts\\llm_setup.py --use auto      # Gemini if it works, else Anthropic
    backend\\.venv\\Scripts\\python.exe scripts\\llm_setup.py --use gemini
    backend\\.venv\\Scripts\\python.exe scripts\\llm_setup.py --use anthropic

What it does
  * Sends one tiny real request per configured provider and prints OK / FAIL. Keys are never
    printed.
  * For Gemini it asks the API which models YOUR key can use (model names change and free-tier
    keys differ), picks the newest stable "flash" / "flash-lite", and verifies each with a call.
  * With --use it rewrites only these non-secret lines in backend/.env:
      AGENTS_LLM_PROVIDER, AGENTS_DEEP_MODEL, AGENTS_QUICK_MODEL, GEMINI_MODEL
    Restart the services afterwards (scripts\\dev_up.ps1 -Restart) so the workers pick it up.

How the two providers are used once both keys are set: the router sends high-volume, creative
work to Gemini and high-stakes reasoning over stored data to Claude, and falls back to Claude
if Gemini is unavailable (see backend/app/llm/router.py). The Agent Desk uses whichever
provider you select here.
"""
from __future__ import annotations

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
ENV_PATH = os.path.join(BACKEND, ".env")
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app.core.config import settings  # noqa: E402

HAIKU = "claude-haiku-4-5-20251001"
# Stable, text-capable Gemini ids only: gemini-<ver>-flash or -flash-lite (no preview/exp/image/tts/live).
STABLE = re.compile(r"^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$")


def scrub(text: str, *secrets: str | None) -> str:
    for s in secrets:
        if s:
            text = text.replace(s, "<key>")
    return text[:220]


def test_gemini() -> tuple[bool, str, str | None, str | None]:
    """-> (ok, message, deep_model, quick_model)"""
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        return False, "GEMINI_API_KEY is not set in backend/.env (add a line:  GEMINI_API_KEY=your_key )", None, None
    hint = ""
    if key.startswith("AQ."):
        hint = " (this looks like a Google Cloud key; Gemini needs an AI Studio key that starts with 'AIza' - create one at https://aistudio.google.com/apikey)"
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=key)
        usable = []
        for m in client.models.list():
            name = (m.name or "").removeprefix("models/")
            actions = getattr(m, "supported_actions", None) or []
            if STABLE.match(name) and (not actions or "generateContent" in actions):
                usable.append(name)
    except Exception as exc:  # noqa: BLE001
        return False, f"could not list models: {type(exc).__name__}: {scrub(str(exc), key)}{hint}", None, None

    def rank(n: str) -> float:
        return float(STABLE.match(n).group(1))

    flash = sorted((n for n in usable if not n.endswith("-lite")), key=rank, reverse=True)
    lite = sorted((n for n in usable if n.endswith("-lite")), key=rank, reverse=True)
    if not flash and not lite:
        return False, f"key works but exposes no stable flash models ({len(usable)} found){hint}", None, None

    def first_working(candidates: list[str]) -> tuple[str | None, str]:
        last = "no candidates"
        for name in candidates[:4]:
            try:
                r = client.models.generate_content(
                    model=name, contents="Reply with the single word OK.",
                    config=types.GenerateContentConfig(max_output_tokens=16),
                )
                if (r.text or "").strip():
                    return name, ""
                last = f"{name}: empty reply"
            except Exception as exc:  # noqa: BLE001
                last = f"{name}: {type(exc).__name__}: {scrub(str(exc), key)}"
        return None, last

    deep, why_d = first_working(flash or lite)
    quick, why_q = first_working(lite or flash)
    if not deep and not quick:
        return False, f"models listed but calls failed - {why_d}{hint}", None, None
    deep = deep or quick
    quick = quick or deep
    return True, f"OK  (deep={deep}, quick={quick})", deep, quick


def test_anthropic() -> tuple[bool, str]:
    key = (settings.ANTHROPIC_API_KEY or "").strip()
    if not key:
        return False, "ANTHROPIC_API_KEY is not set"
    try:
        import anthropic

        r = anthropic.Anthropic(api_key=key).messages.create(
            model=HAIKU, max_tokens=8, messages=[{"role": "user", "content": "Reply with the single word OK."}]
        )
        return True, f"OK  (model={HAIKU}, reply={r.content[0].text.strip()[:12]!r})"
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {scrub(str(exc), key)}"


def set_env(updates: dict[str, str]) -> None:
    with open(ENV_PATH, encoding="utf-8") as fh:
        raw = fh.read()
    nl = "\r\n" if "\r\n" in raw else "\n"
    lines = raw.splitlines()
    for key, value in updates.items():
        pat = re.compile(rf"^\s*{re.escape(key)}\s*=")
        idx = [i for i, ln in enumerate(lines) if pat.match(ln)]
        if idx:
            lines[idx[0]] = f"{key}={value}"
            for i in reversed(idx[1:]):  # a duplicate line would silently override the first
                del lines[i]
        else:
            lines.append(f"{key}={value}")
    with open(ENV_PATH, "w", encoding="utf-8", newline="") as fh:
        fh.write(nl.join(lines) + nl)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--use", choices=("auto", "gemini", "anthropic"))
    args = ap.parse_args()

    g_ok, g_msg, deep, quick = test_gemini()
    a_ok, a_msg = test_anthropic()
    print(f"Gemini    : {'PASS' if g_ok else 'FAIL'} - {g_msg}")
    print(f"Anthropic : {'PASS' if a_ok else 'FAIL'} - {a_msg}")
    print(f"Agent Desk is currently set to: {settings.AGENTS_LLM_PROVIDER} "
          f"(deep={settings.AGENTS_DEEP_MODEL}, quick={settings.AGENTS_QUICK_MODEL})")

    if not args.use:
        if g_ok and a_ok:
            print("Both providers work. Run with  --use gemini  or  --use auto  to switch the Agent Desk.")
        return 0 if (g_ok or a_ok) else 1

    choice = args.use
    if choice == "auto":
        choice = "gemini" if g_ok else "anthropic"
    if choice == "gemini" and not g_ok:
        print("Not switching: Gemini failed its test (fix the key first).")
        return 1
    if choice == "anthropic" and not a_ok:
        print("Not switching: Anthropic failed its test.")
        return 1

    if choice == "gemini":
        set_env({"AGENTS_LLM_PROVIDER": "google", "AGENTS_DEEP_MODEL": deep,
                 "AGENTS_QUICK_MODEL": quick, "GEMINI_MODEL": deep})
    else:
        set_env({"AGENTS_LLM_PROVIDER": "anthropic", "AGENTS_DEEP_MODEL": HAIKU,
                 "AGENTS_QUICK_MODEL": HAIKU, "ANTHROPIC_MODEL": HAIKU})
    print(f"Agent Desk provider set to: {choice}.")
    print("Now restart so the workers pick it up:")
    print("  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\dev_up.ps1 -FrontendPort 3001 -Restart")
    return 0


if __name__ == "__main__":
    sys.exit(main())

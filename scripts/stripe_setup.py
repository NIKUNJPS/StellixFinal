#!/usr/bin/env python3
"""One-time Stripe Products/Prices setup (Batch 14).

Creates the Starter and Pro Stripe Products + recurring monthly Prices via
the real Stripe API and prints the resulting Price IDs to paste into
backend/.env (or infra/.env) as STRIPE_PRICE_STARTER/STRIPE_PRICE_PRO — Price
IDs are never hardcoded in application code (test-mode and live-mode
products/prices are entirely separate objects with different IDs).

Enterprise is deliberately absent: "Contact Sales," no self-serve Checkout,
no Stripe object at all.

Idempotent: re-running looks up existing Products by name first, so it
never creates duplicates — safe to run again if you lose the printed Price
IDs before pasting them into .env.

Usage (from the repo root, using the backend's own venv so the `stripe`
package is on the path):

    backend/.venv/Scripts/python.exe scripts/stripe_setup.py

Requires STRIPE_SECRET_KEY to be set (backend/.env, infra/.env, or the
process environment) — prints a clear error and exits non-zero rather than
crashing if it isn't.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Recurring monthly USD price, in cents. Pricing taken directly from this
# batch's own prompt ("Starter <<... e.g. $49/mo>>, Pro <<... e.g. $199/mo>>").
PLANS: list[dict] = [
    {
        "env_var": "STRIPE_PRICE_STARTER",
        "product_name": "Stellix Labs — Starter",
        "description": "Starter plan — up to 25 active strategies.",
        "unit_amount": 4900,
    },
    {
        "env_var": "STRIPE_PRICE_PRO",
        "product_name": "Stellix Labs — Pro",
        "description": "Pro plan — unlimited active strategies.",
        "unit_amount": 19900,
    },
]


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for candidate in (REPO_ROOT / "backend" / ".env", REPO_ROOT / "infra" / ".env"):
        if candidate.exists():
            load_dotenv(candidate, override=False)


def _find_existing_product(stripe_module, name: str, *, api_key: str):
    products = stripe_module.Product.list(limit=100, active=True, api_key=api_key)
    for product in products.data:
        if product.name == name:
            return product
    return None


def _find_existing_monthly_price(stripe_module, product_id: str, unit_amount: int, *, api_key: str):
    prices = stripe_module.Price.list(product=product_id, active=True, limit=100, api_key=api_key)
    for price in prices.data:
        if (
            price.unit_amount == unit_amount
            and price.recurring
            and price.recurring.get("interval") == "month"
        ):
            return price
    return None


def main() -> int:
    _load_env()
    api_key = os.environ.get("STRIPE_SECRET_KEY")
    if not api_key:
        print(
            "STRIPE_SECRET_KEY is not set (checked backend/.env, infra/.env, and the "
            "process environment). Billing is deferred until a real Stripe account is "
            "attached - nothing to do yet. Set STRIPE_SECRET_KEY and re-run.",
            file=sys.stderr,
        )
        return 1

    try:
        import stripe
    except ImportError:
        print("The `stripe` package isn't installed in this Python environment.", file=sys.stderr)
        print("Run with: backend/.venv/Scripts/python.exe scripts/stripe_setup.py", file=sys.stderr)
        return 1

    print(f"Using Stripe API key: {api_key[:11]}{'*' * 10}")
    results: dict[str, str] = {}

    try:
        for plan in PLANS:
            product = _find_existing_product(stripe, plan["product_name"], api_key=api_key)
            if product is None:
                product = stripe.Product.create(
                    name=plan["product_name"], description=plan["description"], api_key=api_key
                )
                print(f"Created product: {plan['product_name']} ({product.id})")
            else:
                print(f"Found existing product: {plan['product_name']} ({product.id})")

            price = _find_existing_monthly_price(stripe, product.id, plan["unit_amount"], api_key=api_key)
            if price is None:
                price = stripe.Price.create(
                    product=product.id,
                    unit_amount=plan["unit_amount"],
                    currency="usd",
                    recurring={"interval": "month"},
                    nickname=f"{plan['product_name']} Monthly",
                    api_key=api_key,
                )
                print(f"  Created price: {price.id} (${plan['unit_amount'] / 100:.2f}/mo)")
            else:
                print(f"  Found existing price: {price.id} (${plan['unit_amount'] / 100:.2f}/mo)")

            results[plan["env_var"]] = price.id
    except stripe.error.StripeError as exc:
        print(f"\nStripe API error: {exc}", file=sys.stderr)
        return 1

    print()
    print("Add these to backend/.env (or infra/.env):")
    print()
    for env_var, price_id in results.items():
        print(f"{env_var}={price_id}")
    print()
    print(
        "Enterprise has no Stripe Product/Price — it's Contact Sales only; "
        "POST /billing/checkout rejects tier=enterprise before ever calling Stripe."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Black-Scholes-Merton Greeks for European options (Batch 31, ADR 0010).

Inputs are the provider's own implied volatility and a risk-free rate (FRED 3-month
T-bill when available, else ``TERMINAL_RISK_FREE_RATE``, stated in the response).
US equity options are American, so these are the standard European approximations
every retail and most institutional terminals display; the UI labels them as such.
No dividend yield term (q = 0): stated, not hidden.

Units: theta per calendar day, vega and rho per 1 percentage point.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from scipy.stats import norm


@dataclass(frozen=True)
class Greeks:
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float

    def as_dict(self) -> dict:
        return {k: round(getattr(self, k), 6) for k in ("delta", "gamma", "theta", "vega", "rho")}


def bs_greeks(*, spot: float, strike: float, years: float, rate: float, vol: float, call: bool) -> Greeks | None:
    """None when any input makes the model undefined (expired, zero vol, bad prices)."""
    if not (spot and strike and spot > 0 and strike > 0 and years > 0 and vol and vol > 0):
        return None
    sqrt_t = math.sqrt(years)
    d1 = (math.log(spot / strike) + (rate + 0.5 * vol * vol) * years) / (vol * sqrt_t)
    d2 = d1 - vol * sqrt_t
    pdf_d1 = norm.pdf(d1)
    disc = math.exp(-rate * years)
    gamma = pdf_d1 / (spot * vol * sqrt_t)
    vega = spot * pdf_d1 * sqrt_t / 100.0
    if call:
        delta = norm.cdf(d1)
        theta = (-spot * pdf_d1 * vol / (2 * sqrt_t) - rate * strike * disc * norm.cdf(d2)) / 365.0
        rho = strike * years * disc * norm.cdf(d2) / 100.0
    else:
        delta = norm.cdf(d1) - 1.0
        theta = (-spot * pdf_d1 * vol / (2 * sqrt_t) + rate * strike * disc * norm.cdf(-d2)) / 365.0
        rho = -strike * years * disc * norm.cdf(-d2) / 100.0
    return Greeks(delta=delta, gamma=gamma, theta=theta, vega=vega, rho=rho)


def bs_price(*, spot: float, strike: float, years: float, rate: float, vol: float, call: bool) -> float:
    sqrt_t = math.sqrt(years)
    d1 = (math.log(spot / strike) + (rate + 0.5 * vol * vol) * years) / (vol * sqrt_t)
    d2 = d1 - vol * sqrt_t
    if call:
        return spot * norm.cdf(d1) - strike * math.exp(-rate * years) * norm.cdf(d2)
    return strike * math.exp(-rate * years) * norm.cdf(-d2) - spot * norm.cdf(-d1)

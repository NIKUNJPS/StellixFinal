"""Application configuration.

All settings come from environment variables (12-factor). The same variable names
are defined in `infra/.env.example`. Secrets are NEVER hardcoded — defaults here are
non-secret development conveniences only, and production must supply real values.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application settings loaded from the environment."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../infra/.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ---- Application ---------------------------------------------------------
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    PROJECT_NAME: str = "Stellix Labs"
    API_V1_PREFIX: str = "/api/v1"
    # NoDecode: stop pydantic-settings from JSON-decoding the dotenv value before our
    # validator runs, so the documented comma-separated form (e.g.
    # "http://localhost:3000,https://app.example.com") parses correctly. A JSON list
    # value also still works via the validator.
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # ---- PostgreSQL + TimescaleDB ------------------------------------------
    # Async URL (asyncpg) used by the running application.
    DATABASE_URL: str = "postgresql+asyncpg://stellix:change-me-postgres@localhost:5432/stellix"
    # Sync URL (psycopg) used by Alembic migrations.
    DATABASE_URL_SYNC: str = (
        "postgresql+psycopg://stellix:change-me-postgres@localhost:5432/stellix"
    )

    # ---- Neo4j --------------------------------------------------------------
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "change-me-neo4j"

    # ---- Redis --------------------------------------------------------------
    REDIS_URL: str = "redis://:change-me-redis@localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://:change-me-redis@localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://:change-me-redis@localhost:6379/2"

    # ---- Auth / JWT ---------------------------------------------------------
    JWT_SECRET_KEY: str = "change-me-generate-a-long-random-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ---- Account lockout (Batch 1) -----------------------------------------
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCKOUT_MINUTES: int = 15

    # ---- Auth rate limiting (per IP; in-process for Batch 1, Redis in B11) -
    AUTH_RATE_LIMIT_TIMES: int = 5
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ---- Data ingestion & feature engineering (Batch 2) --------------------
    ALPHA_VANTAGE_API_KEY: str | None = None
    # Fraction of rows allowed to be dropped for NaN OHLC before we add a warning.
    DATA_NAN_TOLERANCE: float = 0.05
    # A timestamp gap larger than interval * this multiplier is a data-quality warning.
    DATA_GAP_INTERVAL_MULTIPLIER: int = 3

    # ---- Regime detection ensemble (Batch 3) -------------------------------
    REGIME_MIN_PERIODS: int = 60          # need enough history to fit the models
    REGIME_CRISIS_PERCENTILE: float = 95.0  # GARCH cond-vol crisis threshold
    REGIME_HIGH_VOL_PERCENTILE: float = 60.0  # GARCH high-vol threshold
    REGIME_WEIGHT_WINDOW: int = 50        # trailing window for self-consistency weights
    REGIME_PELT_PEN_SCALE: float = 3.0    # PELT penalty scale (× log n)
    REGIME_RANDOM_STATE: int = 42         # determinism for HMM/GMM

    # ---- Validation engine (Batch 5) ---------------------------------------
    VALIDATION_WALK_FORWARD_FOLDS: int = 5
    VALIDATION_MONTE_CARLO_SIMS: int = 1000
    VALIDATION_PERSISTENCE_ALPHA: float = 0.05
    VALIDATION_RANDOM_SEED: int = 42
    # Fallback max-drawdown risk tolerance (%) when an org has none set.
    DEFAULT_RISK_TOLERANCE_MAX_DD_PCT: float = 30.0

    # ---- LLM research assistant (Batch 9) -----------------------------------
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"

    # ---- Multi-model cost router (Batch 18) ---------------------------------
    # Gemini handles the high-volume/creative functions; Claude handles the ones
    # that reason over real stored data (see app/llm/router.py for the routing
    # table and why each function lands where it does). Deferred-credential
    # pattern as everywhere else: unset key -> that provider is unavailable and
    # the router degrades (Gemini falls back to Claude; see LLMCostRouter.call).
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ---- Macro dashboard (Batch 28) -------------------------------------------
    # FRED (Federal Reserve Economic Data) — a real, official, documented API
    # (api.stlouisfed.org/fred), requiring a free key from a self-service account
    # at fredaccount.stlouisfed.org. Deferred-credential pattern as everywhere
    # else: unset => the macro dashboard reports "not configured" honestly,
    # never fabricated data. FRED updates daily series once a day at most, so the
    # refresh interval matches that cadence rather than polling faster.
    FRED_API_KEY: str | None = None
    FRED_REFRESH_SECONDS: int = 86_400  # once a day — matches FRED's own update cadence

    # ---- Global market indices (Batch 25) ------------------------------------
    # Periodically refreshed, DELAYED public index quotes for the dashboard — not a
    # real-time feed. Free providers delay index prices (typically ~15-20 min,
    # exchange-dependent) and throttle aggressive polling, so the default refresh is
    # two minutes. Plugging in a paid real-time provider means implementing
    # MarketDataProvider.fetch_latest_quotes and setting MARKET_QUOTES_REALTIME=true.
    MARKET_QUOTES_ENABLED: bool = True
    MARKET_QUOTES_PROVIDER: str = "yfinance"
    MARKET_QUOTES_REFRESH_SECONDS: int = 120
    # A symbol whose last successful refresh is older than this is shown as
    # unavailable rather than as a frozen number.
    MARKET_QUOTES_STALE_AFTER_SECONDS: int = 900
    MARKET_QUOTES_REALTIME: bool = False
    # Every tracked exchange is closed from Friday's US close to Sunday evening UTC.
    MARKET_QUOTES_SKIP_WEEKENDS: bool = True

    # ---- Governance & compliance export (Batch 10) --------------------------
    # Rendered JSON/PDF exports land here, named "<job_id>.<format>". Local disk is
    # sufficient for the dev/self-hosted deployment target — swap for object storage
    # (S3/GCS) behind the same path-returning interface if that ever changes.
    COMPLIANCE_EXPORT_DIR: str = "var/compliance_exports"

    # ---- User avatars (Batch 12) ---------------------------------------------
    # Same dev-local-disk / swap-for-S3-MinIO-in-production pattern as the
    # compliance export dir above.
    AVATAR_UPLOAD_DIR: str = "var/avatars"

    # ---- Observability (Batch 13) --------------------------------------------
    # Sentry is inert (no-op init) until a real DSN is supplied — same deferred-
    # credential pattern as ANTHROPIC_API_KEY above; requires the project owner's
    # own Sentry account, which this assistant cannot create on their behalf.
    SENTRY_DSN: str | None = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0
    # Grafana alert-notification webhook (Discord/Slack). Consumed by the Grafana
    # provisioning YAML via env substitution, not by backend Python code.
    GRAFANA_ALERT_WEBHOOK_URL: str | None = None

    # ---- Billing (Batch 14) --------------------------------------------------
    # Inert (every billing endpoint 503s "Billing not configured") until a real
    # key is supplied — same deferred-credential pattern as ANTHROPIC_API_KEY;
    # requires the project owner's own Stripe account.
    STRIPE_SECRET_KEY: str | None = None
    # Independently deferrable from the key above — issued when a webhook
    # endpoint is registered with Stripe, which can happen after the key exists.
    STRIPE_WEBHOOK_SECRET: str | None = None
    # Frontend-visible; mirrored there as NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
    # Not used server-side (Checkout/Portal are hosted redirects, no Elements).
    STRIPE_PUBLISHABLE_KEY: str | None = None
    # Price IDs printed by scripts/stripe_setup.py — never hardcoded in
    # application code (test-mode vs. live-mode Price IDs are different objects).
    STRIPE_PRICE_STARTER: str | None = None
    STRIPE_PRICE_PRO: str | None = None
    # Base URL for building Checkout success/cancel and Portal return redirects.
    FRONTEND_URL: str = "http://localhost:3000"

    # ---- Public site / lead capture (Batch 15) -------------------------------
    # Incoming webhook (Discord/Slack-style) for real-time demo-request alerts.
    # Deferred/None by default — same pattern as SENTRY_DSN/STRIPE_SECRET_KEY:
    # the DemoRequest row is always written; the webhook is best-effort notify.
    DEMO_WEBHOOK_URL: str | None = None

    # ---- Transactional email (Batch 25) -------------------------------------
    # SMTP is deliberately generic: it works with Gmail app-passwords, Outlook,
    # Zoho, or the SMTP endpoint of SendGrid/Mailgun/Resend — so the provider can
    # change without touching code. Inert until SMTP_HOST + SMTP_USER +
    # SMTP_PASSWORD are set (same deferred-credential pattern as STRIPE_SECRET_KEY):
    # every send becomes a logged no-op instead of an error, so dev never breaks.
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: SecretStr | None = None
    # The From: header. Many providers require this to match a verified sender.
    SMTP_FROM: str = "Stellix Labs <no-reply@stellixlabs.com>"
    # STARTTLS (port 587, the common default). Set false + port 465 for implicit TLS.
    SMTP_STARTTLS: bool = True
    SMTP_TIMEOUT_SECONDS: float = 10.0

    @property
    def email_enabled(self) -> bool:
        """True only when SMTP is fully configured. Everything email-related checks
        this and degrades to a logged no-op rather than raising."""
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

    # ---- Cookies ------------------------------------------------------------
    # Refresh token is delivered as an httpOnly cookie. Secure=False in dev so it
    # works over http://localhost; set REFRESH_COOKIE_SECURE=true in production.
    REFRESH_COOKIE_NAME: str = "stellix_refresh"
    REFRESH_COOKIE_SECURE: bool = False
    REFRESH_COOKIE_SAMESITE: str = "lax"

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors(cls, value: object) -> object:
        """Accept either a comma-separated string or a JSON array from the environment."""
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                import json

                return json.loads(stripped)
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @model_validator(mode="after")
    def _no_wildcard_cors_in_production(self) -> Settings:
        """Batch 11 hardening: a wildcard origin is a fine local-dev convenience
        but a real misconfiguration in production for a credentialed API — fail
        fast at startup rather than silently serving CORS headers that reflect
        any origin."""
        if self.is_production and "*" in self.BACKEND_CORS_ORIGINS:
            raise ValueError(
                "BACKEND_CORS_ORIGINS must not contain '*' when ENVIRONMENT=production; "
                "list the actual frontend origin(s) instead."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (one instance per process)."""
    return Settings()


settings = get_settings()

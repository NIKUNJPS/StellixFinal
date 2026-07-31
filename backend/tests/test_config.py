"""Regression guards for settings parsing.

``BACKEND_CORS_ORIGINS`` is a ``list[str]``; pydantic-settings treats list fields as
"complex" and JSON-decodes their env/dotenv values BEFORE field validators run. The
documented comma-separated form therefore raised a SettingsError until we annotated
the field with ``NoDecode``. These tests cover both accepted forms.
"""

from __future__ import annotations

import pytest
from app.core.config import Settings
from pydantic import ValidationError


def test_cors_origins_accepts_comma_separated(monkeypatch):
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", "http://a.com,http://b.com")
    settings = Settings()
    assert settings.BACKEND_CORS_ORIGINS == ["http://a.com", "http://b.com"]


def test_cors_origins_accepts_json_array(monkeypatch):
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", '["http://a.com","http://b.com"]')
    settings = Settings()
    assert settings.BACKEND_CORS_ORIGINS == ["http://a.com", "http://b.com"]


def test_wildcard_cors_rejected_in_production(monkeypatch):
    """Batch 11 hardening: a wildcard origin on a credentialed API is a real
    misconfiguration in production, not just a lint nit — fail fast at startup."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", "*")
    with pytest.raises(ValidationError, match="BACKEND_CORS_ORIGINS must not contain '\\*'"):
        Settings()


def test_wildcard_cors_allowed_outside_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", "*")
    settings = Settings()
    assert settings.BACKEND_CORS_ORIGINS == ["*"]


def test_specific_origins_allowed_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", "https://app.stellixlabs.com")
    settings = Settings()
    assert settings.BACKEND_CORS_ORIGINS == ["https://app.stellixlabs.com"]

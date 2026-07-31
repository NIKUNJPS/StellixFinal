"""Pydantic schemas for the public Contact / Request-a-Demo form (Batch 15).

Field names match the frontend form and the DemoRequest ORM model exactly.
Validation mirrors the on-page copy: work-email only, 20-500 char use case,
>=1 primary interest, consent required.
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.demo_request import DemoFirmType, DemoPrimaryInterest, DemoTeamSize

# Free-webmail domains rejected per the approved copy ("Please use your work
# email so we can route your request to the right team.").
_FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com",
    "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com",
    "zoho.com", "yandex.com", "pm.me",
}


class DemoRequestCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    work_email: EmailStr
    company: str = Field(min_length=1, max_length=255)
    job_title: str = Field(min_length=1, max_length=255)
    firm_type: DemoFirmType
    team_size: DemoTeamSize
    use_case_description: str = Field(min_length=20, max_length=500)
    primary_interest: list[DemoPrimaryInterest] = Field(min_length=1)
    source: str | None = Field(default=None, max_length=120)
    consent: bool
    # Honeypot — real users never see or fill this; a non-empty value marks a bot.
    # The endpoint returns a normal-looking success without storing anything.
    website: str | None = Field(default=None, max_length=255)

    @field_validator("work_email")
    @classmethod
    def _reject_free_email(cls, value: EmailStr) -> EmailStr:
        domain = str(value).rsplit("@", 1)[-1].lower()
        if domain in _FREE_EMAIL_DOMAINS:
            raise ValueError(
                "Please use your work email so we can route your request to the right team."
            )
        return value

    @field_validator("consent")
    @classmethod
    def _consent_required(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("Please accept the Privacy Policy to continue.")
        return value

    @field_validator("primary_interest")
    @classmethod
    def _dedupe_interest(cls, value: list[DemoPrimaryInterest]) -> list[DemoPrimaryInterest]:
        # Preserve order, drop dupes — the frontend multi-checkbox can't dupe,
        # but a raw API caller could.
        seen: list[DemoPrimaryInterest] = []
        for item in value:
            if item not in seen:
                seen.append(item)
        return seen


class DemoRequestResponse(BaseModel):
    received: bool
    message: str

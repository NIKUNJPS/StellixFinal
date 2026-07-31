"""Public Contact / Request-a-Demo endpoint (Batch 15).

Unauthenticated — a landing-page visitor has no JWT. Registered WITHOUT the
JWT-keyed global rate limiter (same reason auth/billing.webhook are), carrying
its own dedicated per-IP limiter. Persists a DemoRequest and fires a best-effort
webhook notification so a human sees the lead in real time. See
docs/schemas.md -> DemoRequest.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_system_db
from app.core.config import settings
from app.core.rate_limit import demo_request_rate_limiter
from app.models.demo_request import DemoRequest
from app.schemas.contact import DemoRequestCreate, DemoRequestResponse
from app.services.webhook import post_webhook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["Public"])

_SUCCESS_MESSAGE = (
    "Request received. A real person will reach out within one business day to "
    "schedule your walkthrough."
)


@router.post(
    "/demo-request",
    response_model=DemoRequestResponse,
    dependencies=[Depends(demo_request_rate_limiter)],
    summary="Submit a demo request (public, no auth)",
)
async def submit_demo_request(
    payload: DemoRequestCreate,
    db: AsyncSession = Depends(get_system_db),
) -> DemoRequestResponse:
    # Honeypot: real users never see/fill `website`. A filled honeypot returns a
    # normal-looking success WITHOUT storing anything, so bots get no signal.
    if payload.website:
        logger.info("Demo-request honeypot tripped; dropping silently (email=%s)", payload.work_email)
        return DemoRequestResponse(received=True, message=_SUCCESS_MESSAGE)

    demo = DemoRequest(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        work_email=str(payload.work_email).lower(),
        company=payload.company.strip(),
        job_title=payload.job_title.strip(),
        firm_type=payload.firm_type,
        team_size=payload.team_size,
        use_case_description=payload.use_case_description.strip(),
        primary_interest=[i.value for i in payload.primary_interest],
        source=payload.source,
        consent=payload.consent,
    )
    db.add(demo)
    await db.commit()
    await db.refresh(demo)

    # Best-effort real-time notification — the durable row is already committed,
    # so a webhook failure never affects the visitor's success response.
    await post_webhook(
        settings.DEMO_WEBHOOK_URL,
        {
            "content": (
                f":wave: New demo request from **{demo.first_name} {demo.last_name}** "
                f"({demo.job_title} @ {demo.company})\n"
                f"Email: {demo.work_email} · Firm: {demo.firm_type.value} · "
                f"Team: {demo.team_size.value}\n"
                f"Interest: {', '.join(demo.primary_interest)}\n"
                f"> {demo.use_case_description}"
            ),
            "demo_request_id": str(demo.id),
        },
    )
    logger.info("Demo request stored id=%s email=%s firm=%s", demo.id, demo.work_email, demo.firm_type.value)

    return DemoRequestResponse(received=True, message=_SUCCESS_MESSAGE)

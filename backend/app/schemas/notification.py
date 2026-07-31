"""Pydantic schemas for the notification endpoints (Batch 12)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationType


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    message: str
    link: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    total: int
    unread_count: int
    count: int
    items: list[NotificationRead]


class MarkAllReadResponse(BaseModel):
    marked_count: int

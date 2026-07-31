"""Shared Pydantic field validators (Batch 11 input-validation audit).

Reused across every schema with a JSONB-backed dict field (rule DSL, GA config
overrides, etc.) so a malicious or buggy giant payload never reaches the
database. Applied via Pydantic v2's documented "reuse a validator function"
pattern: ``_check_x = field_validator("x")(check_json_size)``.
"""

from __future__ import annotations

import json

MAX_JSON_FIELD_BYTES = 100_000  # 100KB, per the Batch 11 spec


def check_json_size(value: dict | list | None, *, max_bytes: int = MAX_JSON_FIELD_BYTES):
    """Reject a JSON-typed field whose serialized size exceeds ``max_bytes``."""
    if value is None:
        return value
    size = len(json.dumps(value).encode("utf-8"))
    if size > max_bytes:
        raise ValueError(f"Field is too large ({size} bytes; max {max_bytes} bytes)")
    return value

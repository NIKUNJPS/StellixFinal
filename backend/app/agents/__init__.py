"""Multi-agent desk — the only package allowed to import ``tradingagents`` (ADR 0009).

* ``runner``          — builds and drives the TradingAgents LangGraph pipeline
* ``context``         — Stellix regime / evidence / failures / lessons, point-in-time
* ``audit_callback``  — captures every agent LLM call for ``llm_audit_log``
* ``redaction``       — Safeguard 1: numeric price levels never reach storage
* ``scoring``         — realised-alpha summaries grouped by regime x rating
"""

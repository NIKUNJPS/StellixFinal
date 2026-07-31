# ADR 0001: Record Architecture Decisions

- **Status:** Accepted
- **Date:** 2026-06-28
- **Batch:** 0

## Context

Stellix Labs is intended to become a funded production system, not a prototype.
Architectural choices made early (multi-tenancy, the three pillars, the locked tech
stack) are expensive to reverse. We need a durable, low-ceremony record of *why*
decisions were made so future contributors (and future batches) do not relitigate or
accidentally undo them.

## Decision

We keep an **Architecture Decision Record (ADR) log** in `/docs/adr/`. Each
significant decision is one Markdown file, numbered sequentially
(`NNNN-title.md`), with the sections: Context, Decision, Consequences, Status.

ADRs are append-only history. A superseded decision is not deleted; a new ADR is
written that references and supersedes it.

## Consequences

- Every batch that makes a non-trivial architectural choice writes an ADR.
- The session protocol (`PROJECT_CONSTITUTION.md` §6) requires reading recent ADRs
  before starting work.
- This is lightweight overhead that prevents the most expensive class of mistakes:
  silently reversing a deliberate earlier decision.

"""Research Memory package: the lineage / failure-memory index.

PostgreSQL is the single source of truth. Every strategy, failure, regime, performance
snapshot, research note and researcher is projected into an in-process, tenant-scoped
index of typed nodes and relationships (see ``constants.py``) that answers the five
research-memory queries. The index is maintained on every write (``sync_service``) and
rebuilt from Postgres on a schedule (``memory_index``), so it can never drift from the
database. See docs/adr/0012-research-memory-on-postgres.md.
"""

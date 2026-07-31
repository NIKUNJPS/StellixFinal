-- Runs once, on first initialization of the Postgres data volume.
-- Enables the TimescaleDB extension so time-series tables (regime labels,
-- performance history, market data) can become hypertables in later batches.
-- The pgcrypto extension provides gen_random_uuid() for server-side UUID PKs.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

# Stellix Labs backend — production image (Batch 17).
#
# Multi-stage: stage 1 builds all runtime deps into an isolated virtualenv using
# build toolchain that never reaches the final image; stage 2 is a slim runtime
# that copies ONLY that venv + the application package, runs as a non-root user
# (uid 1000), and carries no dev dependencies, no pip cache, and no test files.
#
# The SAME image runs the API and the Celery worker — the K8s celery-worker
# Deployment just overrides the command (see infra/k8s/celery-worker-deployment.yaml).
#
# Build (from the backend/ directory):
#   docker build -t ghcr.io/stellix-labs/backend:latest .

# ---- Stage 1: builder --------------------------------------------------------
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Build toolchain for any sdist-only wheels (discarded with this stage).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Isolated venv so stage 2 can copy a single self-contained tree.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---- Stage 2: runtime --------------------------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    ENVIRONMENT=production

# libgomp1 is the only shared library the runtime deps need (lightgbm's OpenMP).
# Everything else in the locked stack ships manylinux wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 stellix \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin stellix

WORKDIR /app

# The dependency tree, built in stage 1 — no build toolchain, no pip cache.
COPY --from=builder /opt/venv /opt/venv

# Application code + migrations only. Tests, caches, and the local venv are
# excluded by .dockerignore; we copy explicit paths so nothing else leaks in.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# Runtime-writable dirs for the local-disk artifact stores (compliance exports,
# avatars). In K8s these are backed by mounts; owning them lets the non-root user
# write even without a mount.
RUN mkdir -p var/compliance_exports var/avatars \
    && chown -R 1000:1000 /app

USER 1000

EXPOSE 8000

# Container-level health check (K8s uses its own httpGet probes; this covers plain
# `docker run` / compose). Uses the stdlib so no extra package/binary is needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=4).status==200 else 1)"

# API. The celery-worker Deployment overrides this with:
#   celery -A app.worker.celery_app.celery_app worker --loglevel=INFO
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

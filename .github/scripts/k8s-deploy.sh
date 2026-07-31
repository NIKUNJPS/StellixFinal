#!/usr/bin/env bash
# Shared deploy step for staging + production (called by .github/workflows/deploy.yml).
# Expects a configured kubeconfig and these env vars:
#   IMAGE_TAG        immutable image tag to roll out (the commit SHA)
#   BACKEND_IMAGE    e.g. ghcr.io/<owner>/stellix-backend
#   FRONTEND_IMAGE   e.g. ghcr.io/<owner>/stellix-frontend
set -euo pipefail

: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"

NS=stellix
K8S_DIR="infra/k8s"

echo "==> Namespace + config"
kubectl apply -f "${K8S_DIR}/namespace.yaml"
kubectl apply -f "${K8S_DIR}/configmap.yaml"

# The Secret is provided out-of-band (secret manager) — never from this repo.
if ! kubectl -n "$NS" get secret stellix-secrets >/dev/null 2>&1; then
  echo "ERROR: secret/stellix-secrets not found in namespace '$NS'." >&2
  echo "Create it from infra/k8s/secret.example.yaml before deploying." >&2
  exit 1
fi

echo "==> Database migration (alembic upgrade head)"
kubectl -n "$NS" delete job stellix-migrate --ignore-not-found
# Pin the migration Job to this exact backend image, then wait for it to finish.
sed "s#${BACKEND_IMAGE}:latest#${BACKEND_IMAGE}:${IMAGE_TAG}#g" "${K8S_DIR}/migrate-job.yaml" \
  | kubectl apply -f -
kubectl -n "$NS" wait --for=condition=complete job/stellix-migrate --timeout=300s

echo "==> Apply steady-state manifests"
kubectl apply -k "${K8S_DIR}"

echo "==> Roll out this build's images (${IMAGE_TAG})"
kubectl -n "$NS" set image deployment/stellix-backend        backend="${BACKEND_IMAGE}:${IMAGE_TAG}"
kubectl -n "$NS" set image deployment/stellix-celery-worker  celery-worker="${BACKEND_IMAGE}:${IMAGE_TAG}"
kubectl -n "$NS" set image deployment/stellix-frontend       frontend="${FRONTEND_IMAGE}:${IMAGE_TAG}"

echo "==> Wait for rollouts"
kubectl -n "$NS" rollout status deployment/stellix-backend       --timeout=300s
kubectl -n "$NS" rollout status deployment/stellix-celery-worker --timeout=300s
kubectl -n "$NS" rollout status deployment/stellix-frontend      --timeout=300s

echo "==> Deployed ${IMAGE_TAG} to namespace '${NS}'."

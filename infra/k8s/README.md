# Stellix Labs — Kubernetes manifests (Batch 17)

Production deployment manifests for the API, Celery worker, and web tiers.

## What is (and isn't) here

| File | Purpose |
| --- | --- |
| `namespace.yaml` | `stellix` namespace |
| `configmap.yaml` | all **non-secret** env (matches `backend/app/core/config.py`) |
| `secret.example.yaml` | **template** — copy, fill, apply out-of-band; never commit real values |
| `backend-deployment.yaml` | API, 2 replicas, `/health/live` + `/health/ready` probes |
| `celery-worker-deployment.yaml` | worker (same image, worker command) + HPA 1→3 |
| `frontend-deployment.yaml` | Next standalone server, 2 replicas |
| `services.yaml` | ClusterIP Services for API + web |
| `ingress.yaml` | nginx Ingress + cert-manager TLS for `api.*` and `app.*` |
| `migrate-job.yaml` | one-shot `alembic upgrade head`, run before each rollout |
| `kustomization.yaml` | `kubectl apply -k infra/k8s` entrypoint |

### Data tier is intentionally absent
There are **no StatefulSets for PostgreSQL/TimescaleDB, Neo4j, or Redis**. In
production these are **managed cloud services** (e.g. a Timescale-enabled managed
Postgres, Neo4j AuraDB, and a managed Redis) — reached via the connection strings
in the Secret/ConfigMap. Rationale and trade-offs: `docs/adr/0004-managed-data-services.md`.

## Prerequisites
- An ingress-nginx controller and cert-manager (`ClusterIssuer` `letsencrypt-prod`).
- `metrics-server` (for the Celery HPA's CPU metric).
- Managed Postgres + Neo4j + Redis reachable from the cluster.

## Deploy order
```bash
# 1. Namespace + config
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml

# 2. Real secrets (from your secret manager — do NOT commit)
cp secret.example.yaml secret.yaml && $EDITOR secret.yaml
kubectl apply -f secret.yaml

# 3. Migrate the database, wait for completion
kubectl delete job stellix-migrate -n stellix --ignore-not-found
kubectl apply -f migrate-job.yaml
kubectl wait --for=condition=complete job/stellix-migrate -n stellix --timeout=300s

# 4. Everything else (steady state)
kubectl apply -k .
```

The CD workflow (`.github/workflows/deploy.yml`) automates steps 3–4 and patches
the image tags to the commit SHA.

## Queue-depth autoscaling
The Celery HPA scales on CPU as an out-of-the-box proxy. To scale on real broker
queue depth, install [KEDA](https://keda.sh) and swap the HPA for the `ScaledObject`
sketched at the bottom of `celery-worker-deployment.yaml`.

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="$ROOT_DIR/k8s"
NAMESPACE="kraken"

print_help() {
  cat <<'EOF'
Usage: bash scripts/k8s-deploy.sh [--dry-run] [--namespace <ns>]

Deploy open-kraken to Kubernetes.

Options:
  --dry-run        Run kubectl apply with --dry-run=client (no changes applied)
  --namespace <ns> Override target namespace (default: kraken)
  --help           Show this help text

Prerequisites:
  - kubectl configured and connected to target cluster
  - Docker images built and pushed:
      open-kraken/backend:latest
      open-kraken/web:latest
EOF
}

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --help|-h) print_help; exit 0 ;;
    *) echo "unknown argument: $1" >&2; print_help >&2; exit 2 ;;
  esac
done

KUBECTL_ARGS=()
if [[ "$DRY_RUN" == "true" ]]; then
  KUBECTL_ARGS+=("--dry-run=client")
  echo "==> DRY RUN mode — no changes will be applied"
fi

echo "==> Applying namespace..."
kubectl apply -f "$K8S_DIR/namespace.yaml" "${KUBECTL_ARGS[@]}"

echo "==> Applying all manifests..."
kubectl apply -f "$K8S_DIR/" "${KUBECTL_ARGS[@]}"

if [[ "$DRY_RUN" == "false" ]]; then
  echo "==> Waiting for backend rollout..."
  kubectl rollout status deployment/kraken-backend -n "$NAMESPACE" --timeout=120s

  echo "==> Waiting for web rollout..."
  kubectl rollout status deployment/kraken-web -n "$NAMESPACE" --timeout=60s

  echo ""
  echo "==> Deployment complete. Pod status:"
  kubectl get pods -n "$NAMESPACE"
  echo ""
  echo "==> Services:"
  kubectl get svc -n "$NAMESPACE"
fi

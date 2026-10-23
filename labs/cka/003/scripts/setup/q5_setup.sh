#!/bin/bash
set -e

# Create namespace (default already exists, but keep it explicit/idempotent)
kubectl create namespace default --dry-run=client -o yaml | kubectl apply -f - || true

# Existing deployment with no container ports declared, to be reconfigured by the candidate
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: front-end
  namespace: default
  labels:
    app: front-end
spec:
  replicas: 1
  selector:
    matchLabels:
      app: front-end
  template:
    metadata:
      labels:
        app: front-end
    spec:
      containers:
        - name: nginx
          image: nginx:1.19
EOF

echo "Waiting for front-end deployment to be available..."
kubectl wait --for=condition=available --timeout=120s deployment/front-end -n default || {
  echo "WARNING: front-end deployment did not become available in time, continuing anyway"
}

echo "Setup completed for Question 5"

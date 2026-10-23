#!/bin/bash
set -e

kubectl create namespace default --dry-run=client -o yaml | kubectl apply -f - || true

# Existing deployment with 1 replica, to be scaled by the candidate
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: presentation
  namespace: default
  labels:
    app: presentation
spec:
  replicas: 1
  selector:
    matchLabels:
      app: presentation
  template:
    metadata:
      labels:
        app: presentation
    spec:
      containers:
        - name: nginx
          image: nginx:1.19
EOF

echo "Waiting for presentation deployment to be available..."
kubectl wait --for=condition=available --timeout=120s deployment/presentation -n default || {
  echo "WARNING: presentation deployment did not become available in time, continuing anyway"
}

echo "Setup completed for Question 6"

#!/bin/bash
set -e

# Create namespace if not exists (reusing scheduling namespace from Q5)
kubectl create namespace scheduling --dry-run=client -o yaml | kubectl apply -f -

# Ensure the node exists
kubectl get node k8s-worker || {
  echo "Required node k8s-worker not found"
  exit 1
}

echo "Setup completed for Question 7" 
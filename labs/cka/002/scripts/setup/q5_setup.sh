#!/bin/bash
set -e

# Create namespace
kubectl create namespace scheduling --dry-run=client -o yaml | kubectl apply -f -

# Ensure the target node exists and is labeled with hostname
kubectl label node k8s-worker2 kubernetes.io/hostname=k8s-worker2 --overwrite

echo "Setup completed for Question 5" 
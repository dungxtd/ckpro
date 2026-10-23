#!/bin/bash
set -e

# Create namespaces (every namespace automatically gets the built-in
# kubernetes.io/metadata.name label, so "internal" is already selectable by name)
kubectl create namespace fubar --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace internal --dry-run=client -o yaml | kubectl apply -f -

echo "Setup completed for Question 4"

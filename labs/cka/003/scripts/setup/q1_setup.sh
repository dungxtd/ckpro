#!/bin/bash
set -e

# Create namespace
kubectl create namespace app-team1 --dry-run=client -o yaml | kubectl apply -f -

echo "Setup completed for Question 1"

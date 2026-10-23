#!/bin/bash

# Setup for Question 10: Create a Secret and use it in a Pod

# Create the workloads namespace if it doesn't exist already
if ! kubectl get namespace workloads &> /dev/null; then
    kubectl create namespace workloads
fi

# Delete any existing Secret and Pod with the same names
kubectl delete secret db-credentials -n workloads --ignore-not-found=true
kubectl delete pod secure-pod -n workloads --ignore-not-found=true

echo "Setup complete for Question 10: Environment ready for creating Secret 'db-credentials' and Pod 'secure-pod'"
exit 0 
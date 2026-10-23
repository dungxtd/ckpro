#!/bin/bash

# Setup for Question 9: Create a ConfigMap and use it in a Pod

# Create the workloads namespace if it doesn't exist already
if ! kubectl get namespace workloads &> /dev/null; then
    kubectl create namespace workloads
fi

# Delete any existing ConfigMap and Pod with the same names
kubectl delete configmap app-config -n workloads --ignore-not-found=true
kubectl delete pod config-pod -n workloads --ignore-not-found=true

echo "Setup complete for Question 9: Environment ready for creating ConfigMap 'app-config' and Pod 'config-pod'"
exit 0 
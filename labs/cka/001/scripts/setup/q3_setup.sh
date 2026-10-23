#!/bin/bash
# Setup for Question 3: Storage setup

# Create storage namespace if it doesn't exist
kubectl create namespace storage --dry-run=client -o yaml | kubectl apply -f -

# Remove any existing storage class and PVC with the same names
kubectl delete storageclass fast-storage --ignore-not-found=true
kubectl delete pvc -n storage data-pvc --ignore-not-found=true

exit 0 
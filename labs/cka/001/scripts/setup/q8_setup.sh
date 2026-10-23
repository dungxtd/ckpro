#!/bin/bash
# Setup for Question 8: Resource Management setup

# Ensure monitoring namespace exists
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Remove any existing pod with the same name
kubectl delete pod -n monitoring resource-pod --ignore-not-found=true

# Pre-pull the nginx image
kubectl run prefetch-nginx --image=nginx --restart=Never -n monitoring --dry-run=client -o yaml | kubectl apply -f -
sleep 5
kubectl delete pod -n monitoring prefetch-nginx --ignore-not-found=true

exit 0 
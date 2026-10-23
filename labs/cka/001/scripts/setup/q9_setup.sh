#!/bin/bash
# Setup for Question 9: ConfigMap setup

# Remove any existing configmap and pod with the same names
kubectl delete configmap app-config --ignore-not-found=true
kubectl delete pod config-pod --ignore-not-found=true

# Pre-pull the nginx image
kubectl run prefetch-nginx --image=nginx --restart=Never --dry-run=client -o yaml | kubectl apply -f -
sleep 5
kubectl delete pod prefetch-nginx --ignore-not-found=true

exit 0 
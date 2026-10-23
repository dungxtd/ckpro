#!/bin/bash
# Setup for Question 7: Deployment and Service setup

# Remove any existing deployment and service with the same names
kubectl delete deployment web-app --ignore-not-found=true
kubectl delete service web-service --ignore-not-found=true

# Pre-pull the nginx image to speed up deployment creation
kubectl run prefetch-nginx --image=nginx:1.20 --restart=Never --dry-run=client -o yaml | kubectl apply -f -
sleep 5
kubectl delete pod prefetch-nginx --ignore-not-found=true

exit 0 
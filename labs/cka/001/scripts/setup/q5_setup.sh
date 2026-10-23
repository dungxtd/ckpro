#!/bin/bash
# Setup for Question 5: RBAC setup

# Remove any existing resources with the same names
kubectl delete serviceaccount app-sa --ignore-not-found=true
kubectl delete role pod-reader --ignore-not-found=true
kubectl delete rolebinding read-pods --ignore-not-found=true

# Create a test pod to verify RBAC permissions later
kubectl run test-pod --image=nginx --restart=Never --dry-run=client -o yaml | kubectl apply -f -

exit 0 
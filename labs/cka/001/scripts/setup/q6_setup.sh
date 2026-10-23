#!/bin/bash
# Setup for Question 6: Network Policy setup

# Create networking namespace if it doesn't exist
kubectl create namespace networking --dry-run=client -o yaml | kubectl apply -f -

# Remove any existing network policy
kubectl delete networkpolicy -n networking db-policy --ignore-not-found=true

# Create test pods with appropriate labels
kubectl run frontend --image=nginx --labels=role=frontend -n networking --dry-run=client -o yaml | kubectl apply -f -
kubectl run db --image=mysql --labels=role=db -n networking --env=MYSQL_ROOT_PASSWORD=password --dry-run=client -o yaml | kubectl apply -f -

exit 0 
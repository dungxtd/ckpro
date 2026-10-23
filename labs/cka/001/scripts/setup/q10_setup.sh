#!/bin/bash
# Setup for Question 10: Health Check setup

# Remove any existing pod with the same name
kubectl delete pod health-check --ignore-not-found=true

# Pre-pull the nginx image
kubectl run prefetch-nginx --image=nginx --restart=Never --dry-run=client -o yaml | kubectl apply -f -

# Create a ConfigMap with a custom nginx configuration that includes /healthz endpoint
kubectl create configmap nginx-health-config --from-literal=nginx.conf='
events {
    worker_connections 1024;
}
http {
    server {
        listen 80;
        location /healthz {
            access_log off;
            return 200 "healthy\n";
        }
    }
}' --dry-run=client -o yaml | kubectl apply -f -

sleep 5
kubectl delete pod prefetch-nginx --ignore-not-found=true

exit 0 
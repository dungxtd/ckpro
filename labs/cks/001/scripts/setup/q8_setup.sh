#!/bin/bash
# Setup for Question 8: API Server Access Restriction

# Create namespace if it doesn't exist
kubectl create namespace api-restrict 2>/dev/null || true

# Create a ConfigMap containing API server IP for reference
# Note: In a Kind setup, the API server is typically available at 10.96.0.1
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-server-info
  namespace: api-restrict
data:
  api-server-ip: "10.96.0.1"
  api-server-port: "443"
EOF

# Create a pod to test API server access
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: api-tester
  namespace: api-restrict
spec:
  containers:
  - name: curl
    image: curlimages/curl:7.78.0
    command: ["sleep", "3600"]
EOF

echo "Setup completed for Question 8"
exit 0 
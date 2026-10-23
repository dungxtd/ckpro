#!/bin/bash
# Setup for Question 3: API Security with Pod Security Standards

# Create namespace if it doesn't exist
kubectl create namespace api-security 2>/dev/null || true

# Create the PSS viewer ServiceAccount
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pss-viewer
  namespace: api-security
EOF

# Create a sample pod for testing
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: sample-pod
  namespace: api-security
spec:
  containers:
  - name: nginx
    image: nginx
EOF

echo "Setup completed for Question 3"
exit 0 
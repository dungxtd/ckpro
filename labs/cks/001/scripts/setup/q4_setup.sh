#!/bin/bash
# Setup for Question 4: Node Metadata Protection

# Create namespace if it doesn't exist
kubectl create namespace metadata-protect 2>/dev/null || true

# Create a test pod that can access the metadata endpoint
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: metadata-checker
  namespace: metadata-protect
spec:
  containers:
  - name: busybox
    image: busybox
    command: ["sleep", "3600"]
EOF

echo "Setup completed for Question 4"
exit 0 
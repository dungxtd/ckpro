#!/bin/bash
# Setup for Question 7: Service Account Caution

# Create namespace if it doesn't exist
kubectl create namespace service-account-caution 2>/dev/null || true

# Create a default deployment without service account settings for comparison
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: default-app
  namespace: service-account-caution
spec:
  replicas: 1
  selector:
    matchLabels:
      app: default-app
  template:
    metadata:
      labels:
        app: default-app
    spec:
      containers:
      - name: nginx
        image: nginx
EOF

echo "Setup completed for Question 7"
exit 0 
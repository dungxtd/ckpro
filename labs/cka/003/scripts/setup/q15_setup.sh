#!/bin/bash
set -e

kubectl create namespace ing-internal --dry-run=client -o yaml | kubectl apply -f -

# Install ingress-nginx controller if not already present
kubectl get deployment ingress-nginx-controller -n ingress-nginx || {
  echo "Installing ingress-nginx controller..."
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/cloud/deploy.yaml
  kubectl wait --for=condition=available --timeout=180s deployment/ingress-nginx-controller -n ingress-nginx || {
    echo "WARNING: ingress-nginx-controller did not become available in time, continuing anyway"
  }
}

# Backend Deployment + Service "hello" listening on port 5678
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello
  namespace: ing-internal
  labels:
    app: hello
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hello
  template:
    metadata:
      labels:
        app: hello
    spec:
      containers:
        - name: hello
          image: hashicorp/http-echo:1.0.0
          args:
            - "-listen=:5678"
            - "-text=hello"
          ports:
            - containerPort: 5678
---
apiVersion: v1
kind: Service
metadata:
  name: hello
  namespace: ing-internal
spec:
  selector:
    app: hello
  ports:
    - port: 5678
      targetPort: 5678
EOF

echo "Waiting for hello deployment to be available..."
kubectl wait --for=condition=available --timeout=120s deployment/hello -n ing-internal || {
  echo "WARNING: hello deployment did not become available in time, continuing anyway"
}

echo "Setup completed for Question 15"

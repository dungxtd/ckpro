#!/bin/bash
# Setup for Question 1: Network Policies for Backend Services

# Create namespace if it doesn't exist
kubectl create namespace network-security 2>/dev/null || true

# Create sample pods to demonstrate the need for the network policy
# Create a frontend pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: frontend
  namespace: network-security
  labels:
    app: frontend
spec:
  containers:
  - name: nginx
    image: nginx
    ports:
    - containerPort: 80
EOF

# Create a backend pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: backend
  namespace: network-security
  labels:
    app: backend
spec:
  containers:
  - name: nginx
    image: nginx
    ports:
    - containerPort: 8080
EOF

# Create a database pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: database
  namespace: network-security
  labels:
    app: database
spec:
  containers:
  - name: postgres
    image: postgres:13
    env:
    - name: POSTGRES_PASSWORD
      value: "password"
    ports:
    - containerPort: 5432
EOF

# Create a test pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
  namespace: network-security
  labels:
    app: test
spec:
  containers:
  - name: busybox
    image: busybox
    command: ["sleep", "3600"]
EOF

echo "Setup completed for Question 1"
exit 0 
#!/bin/bash
# Setup for Question 6: RBAC with Minimal Permissions

# Create namespace if it doesn't exist
kubectl create namespace rbac-minimize 2>/dev/null || true

# Create the ServiceAccount to be used
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-reader
  namespace: rbac-minimize
EOF

# Create some resources for testing
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
  namespace: rbac-minimize
spec:
  containers:
  - name: nginx
    image: nginx
EOF

kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: test-service
  namespace: rbac-minimize
spec:
  selector:
    app: test
  ports:
  - port: 80
    targetPort: 80
EOF

kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deployment
  namespace: rbac-minimize
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test
  template:
    metadata:
      labels:
        app: test
    spec:
      containers:
      - name: nginx
        image: nginx
EOF

kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-configmap
  namespace: rbac-minimize
data:
  test.conf: |
    # Test configuration
EOF

kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: test-secret
  namespace: rbac-minimize
type: Opaque
data:
  username: YWRtaW4=
  password: cGFzc3dvcmQ=
EOF

echo "Setup completed for Question 6"
exit 0 
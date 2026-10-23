#!/bin/bash
# Setup for Question 12: Secrets Management

# Create namespace if it doesn't exist
kubectl create namespace secrets-management 2>/dev/null || true

# Create a ConfigMap with information about Kubernetes secrets
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: secrets-info
  namespace: secrets-management
data:
  secrets-best-practices.txt: |
    Kubernetes Secrets Best Practices:
    
    1. Avoid using secrets in environment variables
    2. Mount secrets as volumes when possible
    3. Use external secret stores (e.g., Vault) for production
    4. Encrypt etcd data
    5. Use RBAC to restrict access to secrets
    6. Consider using 3rd party tools like Sealed Secrets
    7. Rotate secrets regularly
    8. Avoid storing secrets in container images
EOF

# Create a sample pod to demonstrate incorrect secret handling
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: insecure-app
  namespace: secrets-management
spec:
  containers:
  - name: app
    image: busybox
    command: ["sleep", "3600"]
    env:
    - name: DB_PASSWORD
      value: "plaintext-password-in-env"
EOF

echo "Setup completed for Question 12"
exit 0 
#!/bin/bash
# Setup for Question 11: Pod Security Standards

# Create namespace if it doesn't exist
kubectl create namespace pod-security 2>/dev/null || true

# Create a sample pod to demonstrate what happens without PSS
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: privileged-pod
  namespace: pod-security
spec:
  containers:
  - name: nginx
    image: nginx
    securityContext:
      privileged: true
EOF

# Create a ConfigMap with information about Pod Security Standards
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: pss-info
  namespace: pod-security
data:
  standards.txt: |
    Pod Security Standards provide three different levels of security:
    
    1. Privileged: Unrestricted policy, providing the widest possible level of permissions
    2. Baseline: Minimally restrictive policy, preventing known privilege escalations
    3. Restricted: Heavily restricted policy, following current Pod hardening best practices
    
    To enforce these standards, use the following namespace labels:
    - pod-security.kubernetes.io/enforce: <policy level>
    - pod-security.kubernetes.io/audit: <policy level>
    - pod-security.kubernetes.io/warn: <policy level>
EOF

echo "Setup completed for Question 11"
exit 0 
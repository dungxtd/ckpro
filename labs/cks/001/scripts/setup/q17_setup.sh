#!/bin/bash
# Setup for Question 17: Runtime Security

# Create namespace if it doesn't exist
kubectl create namespace runtime-security 2>/dev/null || true

# Create a ConfigMap with information about runtime security
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: runtime-security-info
  namespace: runtime-security
data:
  runtime-security.txt: |
    Kubernetes Runtime Security Tools:
    
    1. Falco: Behavioral activity monitoring for containers
       - Uses kernel module/eBPF to monitor syscalls
       - Detects anomalous activity at runtime
       - Can trigger alerts and remediation actions
    
    2. Audit Logging: Kubernetes API server auditing
       - Logs API server activity for later analysis
       - Can be configured for different verbosity levels
    
    3. OPA/Gatekeeper: Admission control for runtime enforcement
       - Validates resources at creation time
       - Can prevent non-compliant resources from being created
    
    4. Container Immutability:
       - Read-only root filesystem
       - No shell or package manager
       - Prevents runtime modifications
EOF

# Create a pod with mutable container for comparison
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: mutable-container
  namespace: runtime-security
spec:
  containers:
  - name: nginx
    image: nginx:alpine
EOF

echo "Setup completed for Question 17"
exit 0 
#!/bin/bash
# Setup for Question 20: Cilium Pod-to-Pod Encryption

# Create namespace if it doesn't exist
kubectl create namespace cilium-encryption 2>/dev/null || true

# Create a namespace for secure communications
kubectl create namespace secure-comms 2>/dev/null || true

# Create a ConfigMap with information about Cilium encryption
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: cilium-encryption-info
  namespace: cilium-encryption
data:
  about-cilium.txt: |
    Cilium:
    - eBPF-based networking, observability, and security
    - Implements CNI for Kubernetes networking
    - Provides network policy enforcement
    - Supports transparent encryption
    
    Cilium Encryption Features:
    
    1. IPSec Encryption:
    - Uses IPSec ESP in tunnel mode
    - Encrypts pod-to-pod traffic transparently
    - Can be enabled globally or selectively
    
    2. WireGuard Encryption:
    - Alternative to IPSec
    - Modern, high-performance encryption
    - Simple key management
    
    3. Key Rotation:
    - Automatic key rotation for perfect forward secrecy
    - Configurable rotation intervals
    
    Sample commands for checking encryption status:
    ```
    # Check encryption status
    kubectl exec -n kube-system cilium-xxxx -- cilium status | grep Encryption
    
    # View encryption policies
    kubectl exec -n kube-system cilium-xxxx -- cilium encrypt status
    ```
EOF

# Create sample pods for testing connectivity
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: pod-a
  namespace: secure-comms
  labels:
    app: service-a
spec:
  containers:
  - name: nginx
    image: nginx
EOF

kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: pod-b
  namespace: secure-comms
  labels:
    app: service-b
spec:
  containers:
  - name: nginx
    image: nginx
EOF

echo "Setup completed for Question 20"
exit 0 
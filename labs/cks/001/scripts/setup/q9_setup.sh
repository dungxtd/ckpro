#!/bin/bash
# Setup for Question 9: Secure Container Configuration

# Create namespace if it doesn't exist
kubectl create namespace os-hardening 2>/dev/null || true

# Create a reference pod with standard configuration
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: default-nginx
  namespace: os-hardening
spec:
  containers:
  - name: nginx
    image: nginx
EOF

# Create a ConfigMap with information about Linux capabilities
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: capabilities-info
  namespace: os-hardening
data:
  capabilities.txt: |
    NET_BIND_SERVICE - Allows a process to bind to a port below 1024
    CHOWN - Make arbitrary changes to file UIDs and GIDs
    DAC_OVERRIDE - Bypass file read, write, and execute permission checks
    FOWNER - Bypass permission checks on operations that normally require the file system UID
    FSETID - Don't clear set-user-ID and set-group-ID mode bits when a file is modified
    KILL - Bypass permission checks for sending signals
    SETGID - Make arbitrary manipulations of process GIDs
    SETUID - Make arbitrary manipulations of process UIDs
    SETPCAP - Modify process capabilities
    SYS_CHROOT - Use chroot()
EOF

echo "Setup completed for Question 9"
exit 0 
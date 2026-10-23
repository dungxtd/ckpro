#!/bin/bash
# Setup for Question 10: Seccomp Profile

# Create namespace if it doesn't exist
kubectl create namespace seccomp-profile 2>/dev/null || true

# Create a reference ConfigMap with information about seccomp
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: seccomp-info
  namespace: seccomp-profile
data:
  seccomp.txt: |
    Seccomp (secure computing mode) is a Linux kernel feature that restricts the system calls that a process can make.
    
    In Kubernetes, seccomp profiles can be applied to container runtimes to limit the system calls that containers can make.
    
    Common Seccomp Profile types:
    - RuntimeDefault: Uses the container runtime's default seccomp profile
    - Localhost: Uses a custom seccomp profile from a file on the node
    - Unconfined: Disables seccomp (not recommended for production)
    
    For syscalls in custom profiles, the actions can be:
    - SCMP_ACT_ALLOW: Allow the syscall
    - SCMP_ACT_ERRNO: Return an error code
    - SCMP_ACT_KILL: Kill the process
    - SCMP_ACT_TRAP: Send SIGSYS signal
EOF

echo "Setup completed for Question 10"
exit 0 
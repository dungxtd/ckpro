#!/bin/bash
# Setup for Question 14: Container Image Security

# Create namespace if it doesn't exist
kubectl create namespace image-security 2>/dev/null || true

# Create a ConfigMap with information about container image security
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: image-security-info
  namespace: image-security
data:
  best-practices.txt: |
    Container Image Security Best Practices:
    
    1. Use minimal base images (e.g., Alpine, distroless)
    2. Avoid running as root
    3. Use multi-stage builds to reduce image size
    4. Remove build tools and dependencies in final stage
    5. Update base images regularly to get security patches
    6. Use vulnerability scanning tools
    7. Sign and verify container images
    8. Use read-only root filesystems
    9. Add least-privileged user
    10. Avoid sensitive data in images
EOF

# Create a sample pod using a non-minimal image for comparison
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: large-image-pod
  namespace: image-security
spec:
  containers:
  - name: ubuntu
    image: ubuntu:latest
    command: ["sleep", "3600"]
EOF

echo "Setup completed for Question 14"
exit 0 
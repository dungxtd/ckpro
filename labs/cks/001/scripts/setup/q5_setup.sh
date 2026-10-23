#!/bin/bash
# Setup for Question 5: Binary Verification

# Create namespace if it doesn't exist
kubectl create namespace binary-verify 2>/dev/null || true

# We'll just need to create the namespace for this question
# The student will need to create a pod that mounts the host binaries

echo "Setup completed for Question 5"
exit 0 
#!/bin/bash

# Delete the init-containers namespace if it exists
echo "Setting up environment for Question 14 (Init Containers)..."
kubectl delete namespace init-containers --ignore-not-found=true

# Wait for deletion to complete
sleep 2

# Confirm environment is ready
echo "Environment ready for Question 14"
exit 0 
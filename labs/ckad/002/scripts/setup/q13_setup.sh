#!/bin/bash

# Delete the jobs namespace if it exists
echo "Setting up environment for Question 13 (Jobs)..."
kubectl delete namespace jobs --ignore-not-found=true

# Wait for deletion to complete
sleep 2

# Confirm environment is ready
echo "Environment ready for Question 13"
exit 0 
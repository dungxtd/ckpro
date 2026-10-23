#!/bin/bash

# Delete the app-namespace namespace if it exists
echo "Setting up environment for Question 3 (Deployment)..."
kubectl delete namespace app-namespace --ignore-not-found=true

# Wait for deletion to complete
sleep 2

# Confirm environment is ready
echo "Environment ready for Question 3"
exit 0 
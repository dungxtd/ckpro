#!/bin/bash

# Delete the services namespace if it exists
echo "Setting up environment for Question 6 (Services)..."
kubectl delete namespace services --ignore-not-found=true

# Wait for deletion to complete
sleep 2

# Confirm environment is ready
echo "Environment ready for Question 6"
exit 0 
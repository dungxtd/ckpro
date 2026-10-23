#!/bin/bash

# Delete the network-policy namespace if it exists
echo "Setting up environment for Question 10 (Network Policies)..."
kubectl delete namespace network-policy --ignore-not-found=true

# Wait for deletion to complete
sleep 2

# Confirm environment is ready
echo "Environment ready for Question 10"
exit 0 
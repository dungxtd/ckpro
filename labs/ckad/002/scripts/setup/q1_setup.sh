#!/bin/bash

# Clean up any previous resources
kubectl delete namespace core-concepts --ignore-not-found=true

# Wait for namespace to be deleted
echo "Setting up environment for Question 1..."
sleep 2

echo "Environment ready for Question 1." 
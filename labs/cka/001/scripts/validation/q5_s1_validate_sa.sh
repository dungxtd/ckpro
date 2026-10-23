#!/bin/bash
# Validate if ServiceAccount exists

SA_NAME="app-sa"
NAMESPACE="default"

# Check if ServiceAccount exists
if ! kubectl get serviceaccount $SA_NAME -n $NAMESPACE &> /dev/null; then
    echo "❌ ServiceAccount '$SA_NAME' not found in namespace '$NAMESPACE'"
    exit 1
fi

echo "✅ ServiceAccount '$SA_NAME' exists in namespace '$NAMESPACE'"
exit 0 
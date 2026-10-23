#!/bin/bash
# Validate if namespace app-team1 exists

NAMESPACE="app-team1"

if kubectl get namespace $NAMESPACE &> /dev/null; then
    echo "✅ Namespace '$NAMESPACE' exists"
    exit 0
else
    echo "❌ Namespace '$NAMESPACE' not found"
    exit 1
fi 
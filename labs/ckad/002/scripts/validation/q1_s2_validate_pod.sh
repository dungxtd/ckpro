#!/bin/bash

# Validate that the nginx-pod exists in core-concepts namespace
POD=$(kubectl get pod nginx-pod -n core-concepts -o jsonpath='{.metadata.name}' 2>/dev/null)

if [[ "$POD" == "nginx-pod" ]]; then
    # Pod exists with correct name
    exit 0
else
    # Pod does not exist or has a different name
    echo "Pod 'nginx-pod' does not exist in namespace 'core-concepts'"
    exit 1
fi 
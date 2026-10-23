#!/bin/bash

# Validate that the core-concepts namespace exists
NS=$(kubectl get namespace core-concepts -o jsonpath='{.metadata.name}' 2>/dev/null)

if [[ "$NS" == "core-concepts" ]]; then
    # Namespace exists
    exit 0
else
    # Namespace does not exist
    echo "Namespace 'core-concepts' does not exist"
    exit 1
fi 
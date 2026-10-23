#!/bin/bash

# Validate that the networking namespace exists
NS=$(kubectl get namespace networking -o jsonpath='{.metadata.name}' 2>/dev/null)

if [[ "$NS" == "networking" ]]; then
    # Namespace exists
    exit 0
else
    # Namespace does not exist
    echo "Namespace 'networking' does not exist"
    exit 1
fi 
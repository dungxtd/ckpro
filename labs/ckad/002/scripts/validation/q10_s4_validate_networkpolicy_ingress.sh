#!/bin/bash

# Validate that the NetworkPolicy has correct ingress rules
# First find the NetworkPolicy that targets the secure-db pod
NP_NAME=$(kubectl get networkpolicy -n networking -o jsonpath='{.items[?(@.spec.podSelector.matchLabels.app=="db")].metadata.name}' 2>/dev/null)

if [[ "$NP_NAME" != "" ]]; then
    # NetworkPolicy targeting the secure-db pod exists
    
    # Check the ingress rule
    # Check if it has a 'from' section with podSelector.matchLabels.role=frontend
    FROM_SELECTOR=$(kubectl get networkpolicy $NP_NAME -n networking -o jsonpath='{.spec.ingress[*].from[*].podSelector.matchLabels.role}' 2>/dev/null)
    
    # Check if it specifies port 5432
    PORT=$(kubectl get networkpolicy $NP_NAME -n networking -o jsonpath='{.spec.ingress[*].ports[*].port}' 2>/dev/null)
    
    if [[ "$FROM_SELECTOR" == *"frontend"* && "$PORT" == *"5432"* ]]; then
        # NetworkPolicy has correct ingress rules
        exit 0
    else
        echo "NetworkPolicy '$NP_NAME' does not have correct ingress rules."
        echo "Found from selector: $FROM_SELECTOR (should include 'frontend')"
        echo "Found port: $PORT (should include 5432)"
        exit 1
    fi
else
    # No NetworkPolicy targeting the secure-db pod exists
    echo "No NetworkPolicy targeting the secure-db pod (app=db) exists in the 'networking' namespace"
    exit 1
fi 
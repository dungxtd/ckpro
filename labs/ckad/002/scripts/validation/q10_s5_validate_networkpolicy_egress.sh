#!/bin/bash

# Validate that the NetworkPolicy has correct egress rules
# First find the NetworkPolicy that targets the secure-db pod
NP_NAME=$(kubectl get networkpolicy -n networking -o jsonpath='{.items[?(@.spec.podSelector.matchLabels.app=="db")].metadata.name}' 2>/dev/null)

if [[ "$NP_NAME" != "" ]]; then
    # NetworkPolicy targeting the secure-db pod exists
    
    # Check the egress rule
    # Check if it has a 'to' section with podSelector.matchLabels.role=monitoring
    TO_SELECTOR=$(kubectl get networkpolicy $NP_NAME -n networking -o jsonpath='{.spec.egress[*].to[*].podSelector.matchLabels.role}' 2>/dev/null)
    
    # Check if it specifies port 8080
    PORT=$(kubectl get networkpolicy $NP_NAME -n networking -o jsonpath='{.spec.egress[*].ports[*].port}' 2>/dev/null)
    
    if [[ "$TO_SELECTOR" == *"monitoring"* && "$PORT" == *"8080"* ]]; then
        # NetworkPolicy has correct egress rules
        exit 0
    else
        echo "NetworkPolicy '$NP_NAME' does not have correct egress rules."
        echo "Found to selector: $TO_SELECTOR (should include 'monitoring')"
        echo "Found port: $PORT (should include 8080)"
        exit 1
    fi
else
    # No NetworkPolicy targeting the secure-db pod exists
    echo "No NetworkPolicy targeting the secure-db pod (app=db) exists in the 'networking' namespace"
    exit 1
fi 
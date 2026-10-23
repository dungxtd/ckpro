#!/bin/bash

# Validate that the NetworkPolicy exists with correct name
# Since the question doesn't specify the exact name, we'll check for any NetworkPolicy that targets the secure-db pod
NETWORK_POLICY=$(kubectl get networkpolicy -n networking -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)

if [[ "$NETWORK_POLICY" != "" ]]; then
    # At least one NetworkPolicy exists
    
    # Check if any NetworkPolicy targets the secure-db pod
    # This is a simple check to see if any NetworkPolicy has a podSelector that matches app=db
    DB_SELECTOR=$(kubectl get networkpolicy -n networking -o jsonpath='{.items[*].spec.podSelector.matchLabels.app}' 2>/dev/null)
    
    if [[ "$DB_SELECTOR" == *"db"* ]]; then
        # NetworkPolicy targeting the secure-db pod exists
        exit 0
    else
        echo "No NetworkPolicy targeting the secure-db pod (app=db) exists in the 'networking' namespace"
        exit 1
    fi
else
    # No NetworkPolicy exists
    echo "No NetworkPolicy exists in the 'networking' namespace"
    exit 1
fi 
#!/bin/bash

# Validate that all three pods are created correctly
# Check the secure-db pod
SECURE_DB=$(kubectl get pod secure-db -n networking -o jsonpath='{.metadata.name}' 2>/dev/null)
SECURE_DB_IMAGE=$(kubectl get pod secure-db -n networking -o jsonpath='{.spec.containers[0].image}' 2>/dev/null)
SECURE_DB_LABEL=$(kubectl get pod secure-db -n networking -o jsonpath='{.metadata.labels.app}' 2>/dev/null)

# Check the frontend pod
FRONTEND=$(kubectl get pod frontend -n networking -o jsonpath='{.metadata.name}' 2>/dev/null)
FRONTEND_IMAGE=$(kubectl get pod frontend -n networking -o jsonpath='{.spec.containers[0].image}' 2>/dev/null)
FRONTEND_LABEL=$(kubectl get pod frontend -n networking -o jsonpath='{.metadata.labels.role}' 2>/dev/null)

# Check the monitoring pod
MONITORING=$(kubectl get pod monitoring -n networking -o jsonpath='{.metadata.name}' 2>/dev/null)
MONITORING_IMAGE=$(kubectl get pod monitoring -n networking -o jsonpath='{.spec.containers[0].image}' 2>/dev/null)
MONITORING_LABEL=$(kubectl get pod monitoring -n networking -o jsonpath='{.metadata.labels.role}' 2>/dev/null)

# Check if all pods exist with correct specifications
if [[ "$SECURE_DB" == "secure-db" && 
      "$SECURE_DB_IMAGE" == "postgres:12" && 
      "$SECURE_DB_LABEL" == "db" && 
      "$FRONTEND" == "frontend" && 
      "$FRONTEND_IMAGE" == "nginx" && 
      "$FRONTEND_LABEL" == "frontend" && 
      "$MONITORING" == "monitoring" && 
      "$MONITORING_IMAGE" == "nginx" && 
      "$MONITORING_LABEL" == "monitoring" ]]; then
    # All pods are configured correctly
    exit 0
else
    echo "Not all pods are configured correctly in the 'networking' namespace."
    echo "secure-db pod exists: $SECURE_DB (expected: secure-db)"
    echo "secure-db image: $SECURE_DB_IMAGE (expected: postgres:12)"
    echo "secure-db app label: $SECURE_DB_LABEL (expected: db)"
    echo "frontend pod exists: $FRONTEND (expected: frontend)"
    echo "frontend image: $FRONTEND_IMAGE (expected: nginx)"
    echo "frontend role label: $FRONTEND_LABEL (expected: frontend)"
    echo "monitoring pod exists: $MONITORING (expected: monitoring)"
    echo "monitoring image: $MONITORING_IMAGE (expected: nginx)"
    echo "monitoring role label: $MONITORING_LABEL (expected: monitoring)"
    exit 1
fi 
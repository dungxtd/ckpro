#!/bin/bash
# Validate that the namespace exists with correct PSS label

NAMESPACE="api-security"
EXPECTED_PSS_LABEL="baseline"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check for correct Pod Security Standard label
PSS_LABEL=$(kubectl get namespace $NAMESPACE -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/enforce}')
if [ "$PSS_LABEL" = "$EXPECTED_PSS_LABEL" ]; then
  echo "✅ Namespace has correct Pod Security Standard label: $EXPECTED_PSS_LABEL"
  exit 0
else
  echo "❌ Namespace does not have correct Pod Security Standard label (expected: $EXPECTED_PSS_LABEL, got: $PSS_LABEL)"
  exit 1
fi 
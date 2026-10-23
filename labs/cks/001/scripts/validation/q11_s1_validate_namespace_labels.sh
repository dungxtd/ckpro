#!/bin/bash
# Validate that namespace has correct Pod Security Standard labels

NAMESPACE="pod-security"
EXPECTED_ENFORCE="baseline"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if namespace has PSS enforce label set to baseline
ENFORCE_LABEL=$(kubectl get namespace $NAMESPACE -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/enforce}')
if [ "$ENFORCE_LABEL" != "$EXPECTED_ENFORCE" ]; then
  echo "❌ Namespace doesn't have the correct pod-security.kubernetes.io/enforce label. Expected: $EXPECTED_ENFORCE, Got: $ENFORCE_LABEL"
  exit 1
fi

echo "✅ Namespace has correct Pod Security Standard labels"
exit 0 
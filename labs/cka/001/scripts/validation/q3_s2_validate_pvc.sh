#!/bin/bash
# Validate if PVC exists with correct configuration

NAMESPACE="storage"
PVC_NAME="data-pvc"
SC_NAME="fast-storage"
EXPECTED_SIZE="1Gi"

# Check if PVC exists
if ! kubectl get pvc $PVC_NAME -n $NAMESPACE &> /dev/null; then
    echo "❌ PVC '$PVC_NAME' not found in namespace '$NAMESPACE'"
    exit 1
fi

# Check if correct storage class is used
STORAGE_CLASS=$(kubectl get pvc $PVC_NAME -n $NAMESPACE -o jsonpath='{.spec.storageClassName}')
if [ "$STORAGE_CLASS" != "$SC_NAME" ]; then
    echo "❌ PVC '$PVC_NAME' using incorrect storage class: $STORAGE_CLASS (expected: $SC_NAME)"
    exit 1
fi

# Check if correct size is requested
SIZE=$(kubectl get pvc $PVC_NAME -n $NAMESPACE -o jsonpath='{.spec.resources.requests.storage}')
if [ "$SIZE" != "$EXPECTED_SIZE" ]; then
    echo "❌ PVC '$PVC_NAME' requesting incorrect size: $SIZE (expected: $EXPECTED_SIZE)"
    exit 1
fi

echo "✅ PVC '$PVC_NAME' exists with correct storage class and size"
exit 0 
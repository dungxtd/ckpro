#!/bin/bash
# Validate storage access and configuration

NAMESPACE="storage"
PVC_NAME="data-pvc"
SC_NAME="fast-storage"

# # Check if PVC is bound
# PVC_STATUS=$(kubectl get pvc $PVC_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
# if [ "$PVC_STATUS" != "Bound" ]; then
#     echo "❌ PVC '$PVC_NAME' is not bound (status: $PVC_STATUS)"
#     exit 1
# fi

# Check if StorageClass is default
SC_DEFAULT=$(kubectl get storageclass $SC_NAME -o jsonpath='{.metadata.annotations.storageclass\.kubernetes\.io/is-default-class}')
if [ "$SC_DEFAULT" != "true" ]; then
    echo "❌ StorageClass '$SC_NAME' is not set as default"
    exit 1
fi

# Check if StorageClass has correct reclaim policy
RECLAIM_POLICY=$(kubectl get storageclass $SC_NAME -o jsonpath='{.reclaimPolicy}')
if [ "$RECLAIM_POLICY" != "Delete" ]; then
    echo "❌ StorageClass '$SC_NAME' has incorrect reclaim policy: $RECLAIM_POLICY"
    exit 1
fi

# Check if PVC has correct access mode
ACCESS_MODE=$(kubectl get pvc $PVC_NAME -n $NAMESPACE -o jsonpath='{.spec.accessModes[0]}')
if [ "$ACCESS_MODE" != "ReadWriteOnce" ]; then
    echo "❌ PVC '$PVC_NAME' has incorrect access mode: $ACCESS_MODE"
    exit 1
fi

# Check if PVC has correct storage class
PVC_SC=$(kubectl get pvc $PVC_NAME -n $NAMESPACE -o jsonpath='{.spec.storageClassName}')
if [ "$PVC_SC" != "$SC_NAME" ]; then
    echo "❌ PVC '$PVC_NAME' has incorrect storage class: $PVC_SC"
    exit 1
fi

echo "✅ Storage configuration is correct"
exit 0 
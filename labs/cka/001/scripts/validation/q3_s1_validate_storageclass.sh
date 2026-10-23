#!/bin/bash
# Validate if StorageClass exists with correct configuration

SC_NAME="fast-storage"
EXPECTED_PROVISIONER="kubernetes.io/no-provisioner"

# Check if StorageClass exists
if ! kubectl get storageclass $SC_NAME &> /dev/null; then
    echo "❌ StorageClass '$SC_NAME' not found"
    exit 1
fi

# Check if correct provisioner is used
PROVISIONER=$(kubectl get storageclass $SC_NAME -o jsonpath='{.provisioner}')
if [ "$PROVISIONER" != "$EXPECTED_PROVISIONER" ]; then
    echo "❌ StorageClass '$SC_NAME' using incorrect provisioner: $PROVISIONER (expected: $EXPECTED_PROVISIONER)"
    exit 1
fi

echo "✅ StorageClass '$SC_NAME' exists with correct provisioner"
exit 0 
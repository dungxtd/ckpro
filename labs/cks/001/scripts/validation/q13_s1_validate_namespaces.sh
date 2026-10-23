#!/bin/bash
# Validate that the required tenant namespaces exist

# Define namespaces to check
NAMESPACE_A="tenant-a"
NAMESPACE_B="tenant-b"

# Check if tenant-a namespace exists
kubectl get namespace $NAMESPACE_A &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE_A' not found"
  exit 1
fi

# Check if tenant-b namespace exists
kubectl get namespace $NAMESPACE_B &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE_B' not found"
  exit 1
fi

# Check namespace labels (if required)
LABEL_A=$(kubectl get namespace $NAMESPACE_A -o jsonpath='{.metadata.labels.tenant}' 2>/dev/null)
if [ "$LABEL_A" != "a" ]; then
  echo "❌ Namespace '$NAMESPACE_A' does not have the correct tenant label"
  exit 1
fi

LABEL_B=$(kubectl get namespace $NAMESPACE_B -o jsonpath='{.metadata.labels.tenant}' 2>/dev/null)
if [ "$LABEL_B" != "b" ]; then
  echo "❌ Namespace '$NAMESPACE_B' does not have the correct tenant label"
  exit 1
fi

echo "✅ All tenant namespaces exist with correct labels"
exit 0 
#!/bin/bash
# Validate that Pod Security Standards are enabled for a namespace

NAMESPACE="secure-ns"
EXPECTED_ENFORCE="baseline"
EXPECTED_AUDIT="restricted"
EXPECTED_WARN="restricted"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if namespace has PSS labels
ENFORCE_LABEL=$(kubectl get namespace $NAMESPACE -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/enforce}')
AUDIT_LABEL=$(kubectl get namespace $NAMESPACE -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/audit}')
WARN_LABEL=$(kubectl get namespace $NAMESPACE -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/warn}')

# Check enforce level
if [ -z "$ENFORCE_LABEL" ]; then
  echo "❌ Namespace doesn't have the pod-security.kubernetes.io/enforce label"
  exit 1
fi

if [ "$ENFORCE_LABEL" != "$EXPECTED_ENFORCE" ]; then
  echo "❌ Namespace has incorrect enforce level. Expected: $EXPECTED_ENFORCE, Got: $ENFORCE_LABEL"
  exit 1
fi

# Check audit level
if [ -z "$AUDIT_LABEL" ]; then
  echo "❌ Namespace doesn't have the pod-security.kubernetes.io/audit label"
  exit 1
fi

if [ "$AUDIT_LABEL" != "$EXPECTED_AUDIT" ]; then
  echo "❌ Namespace has incorrect audit level. Expected: $EXPECTED_AUDIT, Got: $AUDIT_LABEL"
  exit 1
fi

# Check warn level
if [ -z "$WARN_LABEL" ]; then
  echo "❌ Namespace doesn't have the pod-security.kubernetes.io/warn label"
  exit 1
fi

if [ "$WARN_LABEL" != "$EXPECTED_WARN" ]; then
  echo "❌ Namespace has incorrect warn level. Expected: $EXPECTED_WARN, Got: $WARN_LABEL"
  exit 1
fi

echo "✅ Pod Security Standards are correctly enabled for namespace '$NAMESPACE'"
exit 0 
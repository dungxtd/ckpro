#!/bin/bash
# Validate that non-compliant pod is rejected and documented

POD_NAME="non-compliant-pod"
NAMESPACE="pod-security"
VIOLATION_FILE="/tmp/violation.txt"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if pod was rejected (should not exist)
if kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null; then
  echo "❌ Non-compliant pod exists, but it should have been rejected"
  exit 1
fi

# Check if violation was documented
if [ ! -f "$VIOLATION_FILE" ]; then
  echo "❌ Violation documentation file not found at $VIOLATION_FILE"
  exit 1
fi

# Check if the file contains relevant error message
if ! grep -q "forbidden" "$VIOLATION_FILE" && ! grep -q "violat" "$VIOLATION_FILE" && ! grep -q "deny" "$VIOLATION_FILE" && ! grep -q "reject" "$VIOLATION_FILE"; then
  echo "❌ Violation documentation doesn't contain relevant error message"
  exit 1
fi

echo "✅ Non-compliant pod was correctly rejected and documented"
exit 0 
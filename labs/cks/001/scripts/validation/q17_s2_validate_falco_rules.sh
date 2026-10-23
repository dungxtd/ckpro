#!/bin/bash
# Validate that Falco rules ConfigMap exists

NAMESPACE="runtime-security"
CONFIGMAP_NAME="falco-rules"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if ConfigMap exists
kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ConfigMap '$CONFIGMAP_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Get ConfigMap data
CM_DATA=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data}')
if [ -z "$CM_DATA" ]; then
  echo "❌ ConfigMap doesn't have any data"
  exit 1
fi

# Check for shell execution detection
if ! echo "$CM_DATA" | grep -q "shell\|bash\|sh\|exec"; then
  echo "❌ Falco rules don't detect shell execution"
  exit 1
fi

# Check for package management detection
if ! echo "$CM_DATA" | grep -q "package\|apt\|apk\|yum\|dnf\|pip\|npm"; then
  echo "❌ Falco rules don't detect package management use"
  exit 1
fi

# Check for sensitive file access detection
if ! echo "$CM_DATA" | grep -q "sensitive\|\/etc\/shadow\|\/etc\/passwd\|credentials\|token"; then
  echo "❌ Falco rules don't detect sensitive file access"
  exit 1
fi

# Check if rules have proper structure
if ! echo "$CM_DATA" | grep -q "rule:\|condition:\|output:\|priority:\|desc:"; then
  echo "❌ Falco rules don't have proper structure"
  exit 1
fi

echo "✅ Falco rules ConfigMap exists with proper detection rules"
exit 0 
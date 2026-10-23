#!/bin/bash
# Validate that ConfigMap exists with seccomp profile

CONFIGMAP_NAME="seccomp-config"
NAMESPACE="seccomp-profile"
PROFILE_KEY="profile.json"

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

# Fetch profile.json from ConfigMap
PROFILE=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o json | jq -r --arg key "$PROFILE_KEY" '.data[$key]')
if [ -z "$PROFILE" ] || [ "$PROFILE" == "null" ]; then
  echo "❌ ConfigMap does not have required key '$PROFILE_KEY'"
  exit 1
fi

# Check if profile is valid JSON
if ! echo "$PROFILE" | jq . > /dev/null 2>&1; then
  echo "❌ ConfigMap content is not valid JSON"
  exit 1
fi

# Check for required seccomp keys
if ! echo "$PROFILE" | jq -e '.defaultAction' > /dev/null 2>&1; then
  echo "❌ ConfigMap does not contain a valid seccomp profile (missing defaultAction)"
  exit 1
fi

if ! echo "$PROFILE" | jq -e '.syscalls' > /dev/null 2>&1; then
  echo "❌ ConfigMap does not contain a valid seccomp profile (missing syscalls)"
  exit 1
fi

echo "✅ ConfigMap exists with valid seccomp profile"
exit 0

#!/bin/bash
# Validate that seccomp profile allows required syscalls

CONFIGMAP_NAME="seccomp-config"
NAMESPACE="seccomp-profile"
PROFILE_KEY="profile.json"
REQUIRED_SYSCALLS=("exit" "exit_group" "rt_sigreturn" "read" "write" "open")

# Check if namespace exists
kubectl get namespace "$NAMESPACE" &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if ConfigMap exists
kubectl get configmap "$CONFIGMAP_NAME" -n "$NAMESPACE" &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ConfigMap '$CONFIGMAP_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Extract profile JSON from ConfigMap using jq instead of jsonpath
PROFILE=$(kubectl get configmap "$CONFIGMAP_NAME" -n "$NAMESPACE" -o json | jq -r --arg key "$PROFILE_KEY" '.data[$key]')

if [ -z "$PROFILE" ] || [ "$PROFILE" == "null" ]; then
  echo "❌ ConfigMap does not have required key '$PROFILE_KEY'"
  exit 1
fi

# Check if it's valid JSON
if ! echo "$PROFILE" | jq . > /dev/null 2>&1; then
  echo "❌ Profile is not valid JSON"
  exit 1
fi

# Check if defaultAction is SCMP_ACT_ERRNO
DEFAULT_ACTION=$(echo "$PROFILE" | jq -r '.defaultAction')
if [ "$DEFAULT_ACTION" != "SCMP_ACT_ERRNO" ]; then
  echo "❌ Profile defaultAction is not SCMP_ACT_ERRNO (actual: $DEFAULT_ACTION)"
  exit 1
fi

# Extract all allowed syscall names into a flat list
ALLOWED_SYSCALLS=$(echo "$PROFILE" | jq -r '[.syscalls[] | select(.action == "SCMP_ACT_ALLOW") | .names[]] | unique | .[]')

# Check if all required syscalls are in the allowed list
for syscall in "${REQUIRED_SYSCALLS[@]}"; do
  if ! echo "$ALLOWED_SYSCALLS" | grep -q -w "$syscall"; then
    echo "❌ Required syscall not allowed: $syscall"
    exit 1
  fi
done

echo "✅ Seccomp profile allows all required syscalls"
exit 0

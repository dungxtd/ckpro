#!/bin/bash
# Validate that the security profile has expected allowed syscalls

PROFILE_NAME="restricted-profile"
NAMESPACE="seccomp"
REQUIRED_SYSCALLS=("open" "read" "write" "close" "stat" "fstat" "lstat" "poll" "exit" "exit_group")

# Check if the pod security policy exists as a ConfigMap
kubectl get configmap $PROFILE_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Security profile ConfigMap '$PROFILE_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if the ConfigMap has the seccomp profile content
PROFILE_CONTENT=$(kubectl get configmap $PROFILE_NAME -n $NAMESPACE -o jsonpath='{.data.profile\.json}')
if [ -z "$PROFILE_CONTENT" ]; then
  echo "❌ Security profile does not contain the required 'profile.json' key in ConfigMap"
  exit 1
fi

# Extract the allowed syscalls
ALLOWED_SYSCALLS=$(echo "$PROFILE_CONTENT" | grep -o '"names":[[:space:]]*\[[^]]*\]' | grep -o '"[^"]*"' | tr -d '"')

# Check if all required syscalls are allowed
MISSING_SYSCALLS=0
for syscall in "${REQUIRED_SYSCALLS[@]}"; do
  if ! echo "$ALLOWED_SYSCALLS" | grep -q "$syscall"; then
    echo "❌ Required syscall not allowed: $syscall"
    MISSING_SYSCALLS=1
  fi
done

if [ $MISSING_SYSCALLS -eq 1 ]; then
  exit 1
fi

echo "✅ Security profile has all required syscalls allowed"
exit 0 
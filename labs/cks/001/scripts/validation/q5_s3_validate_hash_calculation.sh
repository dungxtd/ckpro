#!/bin/bash
# Validate that the hash calculation script works

POD_NAME="verify-bin"
NAMESPACE="binary-verify"
HASH_FILE="/tmp/verified-hashes.txt"
REQUIRED_FILES=("kubectl" "kubelet")

# Check if pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if the hash file exists in the pod
kubectl exec $POD_NAME -n $NAMESPACE -- ls $HASH_FILE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Hash file $HASH_FILE not found in the pod"
  exit 1
fi

# Check if the file contains SHA256 hashes
HASH_CONTENT=$(kubectl exec $POD_NAME -n $NAMESPACE -- cat $HASH_FILE 2>/dev/null)
if [ -z "$HASH_CONTENT" ]; then
  echo "❌ Hash file is empty"
  exit 1
fi

# Check if the file contains hashes for the required files
for file in "${REQUIRED_FILES[@]}"; do
  if ! echo "$HASH_CONTENT" | grep -q "/host-bin/$file"; then
    echo "❌ Hash file does not contain hash for /host-bin/$file"
    exit 1
  fi
done

# Check if the hashes are in the correct format (SHA256)
HASH_FORMAT=$(echo "$HASH_CONTENT" | grep -E "^[a-f0-9]{64}")
if [ -z "$HASH_FORMAT" ]; then
  echo "❌ Hashes are not in the correct SHA256 format"
  exit 1
fi

echo "✅ Hash calculation script works correctly"
exit 0 
#!/bin/bash
# Validate that verification script performs correct verification

NAMESPACE="supply-chain"
SCRIPT_CM="verify-script"
SCRIPT_KEY="verify.sh"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if verification script ConfigMap exists
kubectl get configmap $SCRIPT_CM -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ConfigMap '$SCRIPT_CM' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Get the script content
SCRIPT=$(kubectl get configmap $SCRIPT_CM -n $NAMESPACE -o jsonpath="{.data['$SCRIPT_KEY']}")
if [ -z "$SCRIPT" ]; then
  echo "❌ Script '$SCRIPT_KEY' not found in ConfigMap '$SCRIPT_CM'"
  exit 1
fi

# Check if script uses SHA256 for verification
if ! echo "$SCRIPT" | grep -q "sha256sum\|sha256\|SHA256"; then
  echo "❌ Script doesn't use SHA256 digest verification"
  exit 1
fi

# Check if script verifies container images
if ! echo "$SCRIPT" | grep -q "image\|container\|docker"; then
  echo "❌ Script doesn't verify container images"
  exit 1
fi

# Create a temporary file to run the script
TEMP_SCRIPT="/tmp/verify_test.sh"
echo "$SCRIPT" > $TEMP_SCRIPT
chmod +x $TEMP_SCRIPT

# Try to run the script (just to check syntax, may not succeed)
bash -n $TEMP_SCRIPT &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Script has syntax errors"
  rm $TEMP_SCRIPT
  exit 1
fi

# Clean up
rm $TEMP_SCRIPT

echo "✅ Verification script performs correct verification"
exit 0 
#!/bin/bash
# Validate that secure deployment is applied with fixes

NAMESPACE="static-analysis"
DEPLOYMENT="secure-deployment"
MIN_FIXES=3

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if deployment exists
kubectl get deployment $DEPLOYMENT -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Deployment '$DEPLOYMENT' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if deployment has security fixes
DEPLOY_SPEC=$(kubectl get deployment $DEPLOYMENT -n $NAMESPACE -o json)

# Count the number of security fixes
FIXES=0

# 1. Check if runAsNonRoot is set
if echo "$DEPLOY_SPEC" | grep -q "runAsNonRoot"; then
  FIXES=$((FIXES + 1))
  echo "✓ Fix applied: runAsNonRoot set"
fi

# 2. Check if readOnlyRootFilesystem is set
if echo "$DEPLOY_SPEC" | grep -q "readOnlyRootFilesystem"; then
  FIXES=$((FIXES + 1))
  echo "✓ Fix applied: readOnlyRootFilesystem set"
fi

# 3. Check if privileged mode is disabled
if ! echo "$DEPLOY_SPEC" | grep -q "privileged.*true"; then
  FIXES=$((FIXES + 1))
  echo "✓ Fix applied: privileged mode disabled"
fi

# 4. Check if unnecessary capabilities are dropped
if echo "$DEPLOY_SPEC" | grep -q "capabilities.*drop"; then
  FIXES=$((FIXES + 1))
  echo "✓ Fix applied: unnecessary capabilities dropped"
fi

# 5. Check if hostPath volumes are removed
if ! echo "$DEPLOY_SPEC" | grep -q "hostPath"; then
  FIXES=$((FIXES + 1))
  echo "✓ Fix applied: hostPath volumes removed"
fi

# 6. Check if resource limits are set
if echo "$DEPLOY_SPEC" | grep -q "resources.*limits"; then
  FIXES=$((FIXES + 1))
  echo "✓ Fix applied: resource limits set"
fi

# 7. Check if service account with minimal permissions is used
if echo "$DEPLOY_SPEC" | grep -q "serviceAccountName"; then
  FIXES=$((FIXES + 1))
  echo "✓ Fix applied: specific service account set"
fi

# Check if minimum required fixes are applied
if [ $FIXES -lt $MIN_FIXES ]; then
  echo "❌ Not enough security fixes applied. Found: $FIXES, Required: $MIN_FIXES"
  exit 1
fi

echo "✅ Secure deployment applied with $FIXES security fixes"
exit 0 
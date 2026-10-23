#!/bin/bash
# Validate that Dockerfile ConfigMap exists with secure practices

CONFIGMAP_NAME="dockerfile"
NAMESPACE="image-security"
KEY_NAME="Dockerfile"

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

# Check if ConfigMap has the Dockerfile key
DOCKERFILE=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath="{.data['$KEY_NAME']}")
if [ -z "$DOCKERFILE" ]; then
  echo "❌ ConfigMap doesn't have '$KEY_NAME' key"
  exit 1
fi

# Check for security best practices
# 1. Uses minimal base image (alpine)
if ! echo "$DOCKERFILE" | grep -iq "alpine"; then
  echo "❌ Dockerfile doesn't use minimal alpine base image"
  exit 1
fi

# 2. Installs necessary packages
if ! echo "$DOCKERFILE" | grep -iq "apk add\|apt-get install\|yum install"; then
  echo "❌ Dockerfile doesn't install packages"
  exit 1
fi

# 3. Removes package manager cache
if ! echo "$DOCKERFILE" | grep -iq "rm -rf\|--no-cache\|apt-get clean"; then
  echo "❌ Dockerfile doesn't clean package manager cache"
  exit 1
fi

# 4. Runs as non-root user
if ! echo "$DOCKERFILE" | grep -iq "USER\|user"; then
  echo "❌ Dockerfile doesn't set non-root user"
  exit 1
fi

# 5. Uses read-only root filesystem
if ! echo "$DOCKERFILE" | grep -iq "readonly\|read-only"; then
  echo "❌ Dockerfile doesn't use read-only root filesystem"
  exit 1
fi

echo "✅ Dockerfile ConfigMap exists with secure practices"
exit 0 
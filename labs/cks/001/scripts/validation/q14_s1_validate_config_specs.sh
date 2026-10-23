#!/bin/bash
# Validate that image specs ConfigMap exists with correct data

CONFIGMAP_NAME="image-specs"
NAMESPACE="image-security"
BASE_IMAGE="alpine:3.14"
PACKAGES="nginx"
USER="nginx"
ENTRYPOINT="nginx -g 'daemon off;'"

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

# Check if ConfigMap has required keys
BASE=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.base}')
if [ -z "$BASE" ]; then
  echo "❌ ConfigMap doesn't have 'base' key"
  exit 1
fi

PKG=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.packages}')
if [ -z "$PKG" ]; then
  echo "❌ ConfigMap doesn't have 'packages' key"
  exit 1
fi

USR=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.user}')
if [ -z "$USR" ]; then
  echo "❌ ConfigMap doesn't have 'user' key"
  exit 1
fi

ENTRY=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data.entrypoint}')
if [ -z "$ENTRY" ]; then
  echo "❌ ConfigMap doesn't have 'entrypoint' key"
  exit 1
fi

# Check if values are correct
if [ "$BASE" != "$BASE_IMAGE" ]; then
  echo "❌ Base image value is incorrect. Expected: $BASE_IMAGE, Got: $BASE"
  exit 1
fi

if [ "$PKG" != "$PACKAGES" ]; then
  echo "❌ Packages value is incorrect. Expected: $PACKAGES, Got: $PKG"
  exit 1
fi

if [ "$USR" != "$USER" ]; then
  echo "❌ User value is incorrect. Expected: $USER, Got: $USR"
  exit 1
fi

if [ "$ENTRY" != "$ENTRYPOINT" ]; then
  echo "❌ Entrypoint value is incorrect. Expected: $ENTRYPOINT, Got: $ENTRY"
  exit 1
fi

echo "✅ ConfigMap exists with correct image specs"
exit 0 
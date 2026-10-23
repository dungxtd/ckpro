#!/bin/bash
# Validate that trusted registries ConfigMap exists

CONFIGMAP_NAME="trusted-registries"
NAMESPACE="supply-chain"
REGISTRY1="docker.io/library/"
REGISTRY2="k8s.gcr.io/"

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

# Check if ConfigMap contains ImagePolicyWebhook configuration
CM_DATA=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data}')
if [ -z "$CM_DATA" ]; then
  echo "❌ ConfigMap doesn't have any data"
  exit 1
fi

# Check if the configuration mentions the trusted registries
if ! echo "$CM_DATA" | grep -q "$REGISTRY1"; then
  echo "❌ ConfigMap doesn't specify $REGISTRY1 as a trusted registry"
  exit 1
fi

if ! echo "$CM_DATA" | grep -q "$REGISTRY2"; then
  echo "❌ ConfigMap doesn't specify $REGISTRY2 as a trusted registry"
  exit 1
fi

# Check if the configuration has proper structure for ImagePolicyWebhook
if ! echo "$CM_DATA" | grep -q "ImagePolicyWebhook\|imagePolicyWebhook\|image-policy-webhook\|webhook"; then
  echo "❌ ConfigMap doesn't contain proper ImagePolicyWebhook configuration"
  exit 1
fi

echo "✅ Trusted registries ConfigMap exists with proper configuration"
exit 0 
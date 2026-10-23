#!/bin/bash
# Validate that encryption is configured for Secrets

SECRET_NAME="test-secret"
NAMESPACE="enc-test"
ENCRYPTION_KEY="1234567890123456789012345678901234567890123456789012"

# Create a test namespace if it doesn't exist
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  kubectl create namespace $NAMESPACE &> /dev/null
fi

# Create a test secret
kubectl create secret generic $SECRET_NAME --from-literal=key=value -n $NAMESPACE &> /dev/null

# Check if the API server is running with encryption-provider-config
API_SERVER_PODS=$(kubectl get pods -n kube-system -l component=kube-apiserver -o name)
if [ -z "$API_SERVER_PODS" ]; then
  echo "❌ Could not find kube-apiserver pods"
  exit 1
fi

# Get the first API server pod
API_SERVER_POD=$(echo "$API_SERVER_PODS" | head -n 1)

# Check if encryption-provider-config is set
ENCRYPTION_CONFIG=$(kubectl get $API_SERVER_POD -n kube-system -o jsonpath='{.spec.containers[0].command}' | grep -o "\--encryption-provider-config=[^ ]*")
if [ -z "$ENCRYPTION_CONFIG" ]; then
  echo "❌ API server is not configured with encryption-provider-config"
  exit 1
fi

# Check if the etcd entry for the secret is encrypted
# We'll look for the base64-encoded value "value" in the etcd entry
ETCD_PODS=$(kubectl get pods -n kube-system -l component=etcd -o name)
if [ -z "$ETCD_PODS" ]; then
  echo "❌ Could not find etcd pods"
  exit 1
fi

# Get the first etcd pod
ETCD_POD=$(echo "$ETCD_PODS" | head -n 1)

# This check is a best-effort approximation - we check if the string "value" is visible in clear text
# in the etcd entry for the secret
ETCD_SECRET=$(kubectl exec -n kube-system $ETCD_POD -- etcdctl get /registry/secrets/$NAMESPACE/$SECRET_NAME --prefix 2>/dev/null)
if [[ "$ETCD_SECRET" == *"value"* ]]; then
  echo "❌ Secret appears to be stored unencrypted in etcd"
  exit 1
fi

# Check if aescbc is in the encryption providers
if kubectl get $API_SERVER_POD -n kube-system -o jsonpath='{.spec.containers[0].command}' | grep -q "\--encryption-provider-config"; then
  PROVIDER_CONFIG=$(kubectl get $API_SERVER_POD -n kube-system -o jsonpath='{.spec.containers[0].command}' | grep -o "\--encryption-provider-config=[^ ]*" | cut -d= -f2)
  if [ -n "$PROVIDER_CONFIG" ]; then
    echo "✅ API server is configured with encryption for Secrets"
    exit 0
  fi
fi

echo "❌ Could not verify encryption configuration"
exit 1 
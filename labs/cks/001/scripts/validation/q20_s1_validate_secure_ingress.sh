#!/bin/bash
# Validate that secure ingress is configured

INGRESS_NAME="secure-ingress"
NAMESPACE="secure-app"
TLS_SECRET="secure-tls"
HOST_NAME="secure.example.com"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if ingress exists
kubectl get ingress $INGRESS_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Ingress '$INGRESS_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if TLS is configured
TLS_HOSTS=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath='{.spec.tls[0].hosts}')
if [ -z "$TLS_HOSTS" ]; then
  echo "❌ Ingress doesn't have TLS configured"
  exit 1
fi

# Check if the correct host is configured
if [[ "$TLS_HOSTS" != *"$HOST_NAME"* ]]; then
  echo "❌ Ingress TLS doesn't include the expected host: $HOST_NAME"
  exit 1
fi

# Check if TLS secret is specified
TLS_SECRET_NAME=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath='{.spec.tls[0].secretName}')
if [ "$TLS_SECRET_NAME" != "$TLS_SECRET" ]; then
  echo "❌ Ingress TLS doesn't use the expected secret. Expected: $TLS_SECRET, Got: $TLS_SECRET_NAME"
  exit 1
fi

# Check if TLS secret exists
kubectl get secret $TLS_SECRET -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ TLS Secret '$TLS_SECRET' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if the secret is of type kubernetes.io/tls
SECRET_TYPE=$(kubectl get secret $TLS_SECRET -n $NAMESPACE -o jsonpath='{.type}')
if [ "$SECRET_TYPE" != "kubernetes.io/tls" ]; then
  echo "❌ Secret is not of type kubernetes.io/tls. Found: $SECRET_TYPE"
  exit 1
fi

# Check if the secret has the required fields
TLS_CRT=$(kubectl get secret $TLS_SECRET -n $NAMESPACE -o jsonpath='{.data.tls\.crt}')
TLS_KEY=$(kubectl get secret $TLS_SECRET -n $NAMESPACE -o jsonpath='{.data.tls\.key}')
if [ -z "$TLS_CRT" ] || [ -z "$TLS_KEY" ]; then
  echo "❌ TLS Secret doesn't have the required fields (tls.crt and tls.key)"
  exit 1
fi

echo "✅ Secure ingress is correctly configured"
exit 0 
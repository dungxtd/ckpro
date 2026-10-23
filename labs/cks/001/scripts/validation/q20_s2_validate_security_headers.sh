#!/bin/bash
# Validate that security headers are configured in ingress

INGRESS_NAME="secure-ingress"
NAMESPACE="secure-app"
HOST_NAME="secure.example.com"
REQUIRED_HEADERS=("X-Content-Type-Options" "X-XSS-Protection" "X-Frame-Options")

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

# Check if ingress has annotations
ANNOTATIONS=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath='{.metadata.annotations}')
if [ -z "$ANNOTATIONS" ]; then
  echo "❌ Ingress doesn't have any annotations"
  exit 1
fi

# Check for required security headers in annotations
MISSING_HEADERS=0
for header in "${REQUIRED_HEADERS[@]}"; do
  HEADER_ANNOTATION=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath="{.metadata.annotations.nginx\.ingress\.kubernetes\.io/configuration-snippet}" | grep -i "$header")
  if [ -z "$HEADER_ANNOTATION" ]; then
    echo "❌ Security header '$header' not configured in ingress"
    MISSING_HEADERS=1
  fi
done

if [ $MISSING_HEADERS -eq 1 ]; then
  exit 1
fi

# Check for HSTS configuration
HSTS_CONFIG=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath="{.metadata.annotations.nginx\.ingress\.kubernetes\.io/hsts}")
if [ "$HSTS_CONFIG" != "true" ] && [ -z "$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath="{.metadata.annotations.nginx\.ingress\.kubernetes\.io/configuration-snippet}" | grep -i "Strict-Transport-Security")" ]; then
  echo "❌ HTTP Strict Transport Security (HSTS) not enabled"
  exit 1
fi

# Check if a secure SSL policy is configured
SSL_POLICY=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath="{.metadata.annotations.nginx\.ingress\.kubernetes\.io/ssl-ciphers}")
if [ -z "$SSL_POLICY" ]; then
  # Alternative check for ssl-protocols
  SSL_PROTOCOLS=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath="{.metadata.annotations.nginx\.ingress\.kubernetes\.io/ssl-protocols}")
  if [ -z "$SSL_PROTOCOLS" ] || [[ "$SSL_PROTOCOLS" == *"TLSv1"* ]] || [[ "$SSL_PROTOCOLS" == *"SSLv3"* ]]; then
    echo "❌ No secure SSL policy configured in ingress"
    exit 1
  fi
fi

echo "✅ Security headers are correctly configured in ingress"
exit 0 
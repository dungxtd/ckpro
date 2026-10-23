#!/bin/bash
# Validate that the Ingress has TLS configured correctly

INGRESS_NAME="secure-app"
NAMESPACE="secure-ingress"
EXPECTED_SECRET="secure-app-tls"
EXPECTED_HOSTNAME="secure-app.example.com"

# Check if ingress exists
kubectl get ingress $INGRESS_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Ingress '$INGRESS_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if TLS is configured
TLS_ENABLED=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath='{.spec.tls}')
if [ -z "$TLS_ENABLED" ]; then
  echo "❌ Ingress does not have TLS configured"
  exit 1
fi

# Check for correct TLS secret
SECRET_NAME=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath='{.spec.tls[0].secretName}')
if [ "$SECRET_NAME" != "$EXPECTED_SECRET" ]; then
  echo "❌ Ingress uses incorrect TLS secret: $SECRET_NAME (expected: $EXPECTED_SECRET)"
  exit 1
fi

# Check for correct TLS host
TLS_HOST=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath='{.spec.tls[0].hosts[0]}')
if [ "$TLS_HOST" != "$EXPECTED_HOSTNAME" ]; then
  echo "❌ Ingress TLS configured for incorrect host: $TLS_HOST (expected: $EXPECTED_HOSTNAME)"
  exit 1
fi

echo "✅ Ingress has correct TLS configuration"
exit 0 
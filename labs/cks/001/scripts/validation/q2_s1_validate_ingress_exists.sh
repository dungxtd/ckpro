#!/bin/bash
# Validate that the Ingress exists

INGRESS_NAME="secure-app"
NAMESPACE="secure-ingress"

kubectl get ingress $INGRESS_NAME -n $NAMESPACE &> /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Success: Ingress exists"
  exit 0
else
  echo "❌ Failure: Ingress not found"
  exit 1
fi 
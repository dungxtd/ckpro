#!/bin/bash
# Validate that deployment exists and uses the correct ServiceAccount

DEPLOYMENT_NAME="secure-app"
SA_NAME="minimal-sa"
NAMESPACE="service-account-caution"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if the deployment exists
kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Deployment '$DEPLOYMENT_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if the deployment uses the correct service account
DEPLOYMENT_SA=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.template.spec.serviceAccountName}')
if [ "$DEPLOYMENT_SA" != "$SA_NAME" ]; then
  echo "❌ Deployment does not use the correct ServiceAccount. Expected: $SA_NAME, Got: $DEPLOYMENT_SA"
  exit 1
fi

# Check if the deployment has 2 replicas
REPLICAS=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.replicas}')
if [ "$REPLICAS" != "2" ]; then
  echo "❌ Deployment does not have 2 replicas. Got: $REPLICAS"
  exit 1
fi

# Check if the deployment uses the nginx image
IMAGE=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.template.spec.containers[0].image}')
if [[ "$IMAGE" != *"nginx"* ]]; then
  echo "❌ Deployment does not use the nginx image. Got: $IMAGE"
  exit 1
fi

echo "✅ Deployment exists and uses the correct ServiceAccount"
exit 0 
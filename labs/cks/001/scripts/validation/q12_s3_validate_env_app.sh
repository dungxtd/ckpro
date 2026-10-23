#!/bin/bash
# Validate that pod has secrets as environment variables

POD_NAME="env-app"
NAMESPACE="secrets-management"
SECRET_NAME="db-creds"
ENV_USER="DB_USER"
ENV_PASS="DB_PASS"
EXPECTED_USERNAME="admin"
EXPECTED_PASSWORD="SecretP@ssw0rd"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pod has environment variables referencing the secret
ENV_REFS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json | grep -c "$SECRET_NAME")
if [ "$ENV_REFS" -eq 0 ]; then
  echo "❌ Pod doesn't reference secret '$SECRET_NAME' in environment variables"
  exit 1
fi

# Check if pod has the expected environment variable names
POD_ENV_VARS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].env[*].name}')
if [[ "$POD_ENV_VARS" != *"$ENV_USER"* ]]; then
  echo "❌ Pod doesn't have environment variable $ENV_USER"
  exit 1
fi

if [[ "$POD_ENV_VARS" != *"$ENV_PASS"* ]]; then
  echo "❌ Pod doesn't have environment variable $ENV_PASS"
  exit 1
fi

# Verify env vars in the container
USERNAME=$(kubectl exec $POD_NAME -n $NAMESPACE -- env | grep $ENV_USER | cut -d '=' -f 2)
PASSWORD=$(kubectl exec $POD_NAME -n $NAMESPACE -- env | grep $ENV_PASS | cut -d '=' -f 2)

if [ "$USERNAME" != "$EXPECTED_USERNAME" ]; then
  echo "❌ Environment variable $ENV_USER doesn't have the expected value"
  exit 1
fi

if [ "$PASSWORD" != "$EXPECTED_PASSWORD" ]; then
  echo "❌ Environment variable $ENV_PASS doesn't have the expected value"
  exit 1
fi

echo "✅ Pod has secrets as environment variables"
exit 0 
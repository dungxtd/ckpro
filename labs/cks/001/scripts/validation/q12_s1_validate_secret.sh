#!/bin/bash
# Validate that secret exists with correct data

SECRET_NAME="db-creds"
NAMESPACE="secrets-management"
EXPECTED_USERNAME="admin"
EXPECTED_PASSWORD="SecretP@ssw0rd"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if secret exists
kubectl get secret $SECRET_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Secret '$SECRET_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if secret has username and password keys
USERNAME=$(kubectl get secret $SECRET_NAME -n $NAMESPACE -o jsonpath='{.data.username}' | base64 --decode)
PASSWORD=$(kubectl get secret $SECRET_NAME -n $NAMESPACE -o jsonpath='{.data.password}' | base64 --decode)

if [ -z "$USERNAME" ]; then
  echo "❌ Secret doesn't have 'username' key"
  exit 1
fi

if [ -z "$PASSWORD" ]; then
  echo "❌ Secret doesn't have 'password' key"
  exit 1
fi

# Check if values are correct
if [ "$USERNAME" != "$EXPECTED_USERNAME" ]; then
  echo "❌ Secret has incorrect username. Expected: $EXPECTED_USERNAME"
  exit 1
fi

if [ "$PASSWORD" != "$EXPECTED_PASSWORD" ]; then
  echo "❌ Secret has incorrect password. Expected: $EXPECTED_PASSWORD"
  exit 1
fi

echo "✅ Secret exists with correct data"
exit 0 
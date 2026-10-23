#!/bin/bash
# Validate if Service exists with correct configuration

SERVICE_NAME="web-service"
EXPECTED_TYPE="NodePort"
EXPECTED_PORT=80
EXPECTED_TARGET_PORT=80

# Check if Service exists
if ! kubectl get service $SERVICE_NAME &> /dev/null; then
    echo "❌ Service '$SERVICE_NAME' not found"
    exit 1
fi

# Check if service type is NodePort
SERVICE_TYPE=$(kubectl get service $SERVICE_NAME -o jsonpath='{.spec.type}')
if [ "$SERVICE_TYPE" != "$EXPECTED_TYPE" ]; then
    echo "❌ Service '$SERVICE_NAME' has incorrect type: $SERVICE_TYPE (expected: $EXPECTED_TYPE)"
    exit 1
fi

# Check if port is configured correctly
SERVICE_PORT=$(kubectl get service $SERVICE_NAME -o jsonpath='{.spec.ports[0].port}')
if [ "$SERVICE_PORT" != "$EXPECTED_PORT" ]; then
    echo "❌ Service '$SERVICE_NAME' has incorrect port: $SERVICE_PORT (expected: $EXPECTED_PORT)"
    exit 1
fi

# Check if target port is configured correctly
TARGET_PORT=$(kubectl get service $SERVICE_NAME -o jsonpath='{.spec.ports[0].targetPort}')
if [ "$TARGET_PORT" != "$EXPECTED_TARGET_PORT" ]; then
    echo "❌ Service '$SERVICE_NAME' has incorrect target port: $TARGET_PORT (expected: $EXPECTED_TARGET_PORT)"
    exit 1
fi

# Check if service has endpoints
ENDPOINTS=$(kubectl get endpoints $SERVICE_NAME -o jsonpath='{.subsets[*].addresses[*].ip}' | wc -w)
if [ "$ENDPOINTS" -eq 0 ]; then
    echo "❌ Service '$SERVICE_NAME' has no endpoints"
    exit 1
fi

echo "✅ Service '$SERVICE_NAME' exists with correct configuration"
exit 0 
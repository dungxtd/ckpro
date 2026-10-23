#!/bin/bash
# Validate if ConfigMap exists with correct configuration

CONFIGMAP_NAME="app-config"
EXPECTED_KEY="APP_COLOR"
EXPECTED_VALUE="blue"

# Check if ConfigMap exists
if ! kubectl get configmap $CONFIGMAP_NAME &> /dev/null; then
    echo "❌ ConfigMap '$CONFIGMAP_NAME' not found"
    exit 1
fi

# Check if ConfigMap has the required key
if ! kubectl get configmap $CONFIGMAP_NAME -o jsonpath='{.data.APP_COLOR}' &> /dev/null; then
    echo "❌ ConfigMap '$CONFIGMAP_NAME' missing required key '$EXPECTED_KEY'"
    exit 1
fi

# Check if ConfigMap has the correct value
CONFIG_VALUE=$(kubectl get configmap $CONFIGMAP_NAME -o jsonpath='{.data.APP_COLOR}')
if [ "$CONFIG_VALUE" != "$EXPECTED_VALUE" ]; then
    echo "❌ ConfigMap '$CONFIGMAP_NAME' has incorrect value for '$EXPECTED_KEY': $CONFIG_VALUE (expected: $EXPECTED_VALUE)"
    exit 1
fi

echo "✅ ConfigMap '$CONFIGMAP_NAME' exists with correct configuration"
exit 0 
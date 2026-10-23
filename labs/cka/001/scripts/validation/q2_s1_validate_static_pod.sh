#!/bin/bash
# Validate if static pod manifest exists in the correct location

POD_NAME="static-web"
EXPECTED_IMAGE="nginx:1.19"

# Check if the static pod manifest file exists
if [ ! -f "/etc/kubernetes/manifests/static-web.yaml" ]; then
    echo "❌ Static pod manifest file not found at /etc/kubernetes/manifests/static-web.yaml"
    exit 1
fi

# Verify the manifest is a valid yaml file
if ! grep -q "apiVersion: v1" "/etc/kubernetes/manifests/static-web.yaml"; then
    echo "❌ Static pod manifest is not a valid Kubernetes yaml file"
    exit 1
fi

# Verify it's a Pod resource
if ! grep -q "kind: Pod" "/etc/kubernetes/manifests/static-web.yaml"; then
    echo "❌ Static pod manifest is not configured as a Pod resource"
    exit 1
fi

# Verify the pod name
if ! grep -q "name: ${POD_NAME}" "/etc/kubernetes/manifests/static-web.yaml"; then
    echo "❌ Static pod manifest does not have the correct pod name: ${POD_NAME}"
    exit 1
fi

echo "✅ Static pod manifest exists at the correct location with proper configuration"
exit 0 
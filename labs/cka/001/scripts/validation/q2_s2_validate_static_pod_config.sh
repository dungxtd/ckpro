#!/bin/bash
# Validate static pod manifest configuration

POD_NAME="static-web"
EXPECTED_IMAGE="nginx:1.19"

# Check if static pod manifest exists
if [ ! -f "/etc/kubernetes/manifests/static-web.yaml" ]; then
    echo "❌ Static pod manifest not found at /etc/kubernetes/manifests/static-web.yaml"
    exit 1
fi

# Check if manifest has correct content structure
if ! grep -q "apiVersion: v1" /etc/kubernetes/manifests/static-web.yaml; then
    echo "❌ Static pod manifest missing apiVersion"
    exit 1
fi

if ! grep -q "kind: Pod" /etc/kubernetes/manifests/static-web.yaml; then
    echo "❌ Static pod manifest missing required content: not a Pod resource"
    exit 1
fi

# Check if manifest has correct name
if ! grep -q "name: ${POD_NAME}" /etc/kubernetes/manifests/static-web.yaml; then
    echo "❌ Static pod manifest has incorrect name"
    exit 1
fi

# Check if manifest has correct image
if ! grep -q "image: ${EXPECTED_IMAGE}" /etc/kubernetes/manifests/static-web.yaml; then
    echo "❌ Static pod manifest has incorrect image. Expected: ${EXPECTED_IMAGE}"
    exit 1
fi

# Check if port 80 is defined
if ! grep -q "containerPort: 80" /etc/kubernetes/manifests/static-web.yaml; then
    echo "❌ Static pod manifest missing containerPort: 80"
    exit 1
fi

echo "✅ Static pod manifest has correct configuration"
exit 0 
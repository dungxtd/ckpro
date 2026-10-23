#!/bin/bash
# Validate that ImagePolicyWebhook configuration is correct

CONFIG_DIR="/etc/kubernetes/admission-control"
KUBECONFIG_FILE="$CONFIG_DIR/kubeconfig.yaml"
CONFIG_FILE="/etc/kubernetes/admission-control/admission-configuration.yaml"

# Check if the configuration directory exists
if [ ! -d "$CONFIG_DIR" ]; then
  echo "❌ Admission control directory not found at $CONFIG_DIR"
  exit 1
fi

# Check if the kubeconfig for the webhook exists
if [ ! -f "$KUBECONFIG_FILE" ]; then
  echo "❌ Kubeconfig file not found at $KUBECONFIG_FILE"
  exit 1
fi

# Check if the admission configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ Admission configuration file not found at $CONFIG_FILE"
  exit 1
fi

# Check if the kubeconfig contains the right server URL
SERVER_URL=$(grep "server:" "$KUBECONFIG_FILE" | head -n 1)
if [[ ! "$SERVER_URL" == *"https://"* ]]; then
  echo "❌ Kubeconfig does not contain a valid server URL"
  exit 1
fi

# Check if the admission config has ImagePolicyWebhook configuration
if ! grep -q "ImagePolicy" "$CONFIG_FILE"; then
  echo "❌ Admission configuration file doesn't have ImagePolicy configuration"
  exit 1
fi

# Check if the configuration has allowTTL, denyTTL, and retryBackoff settings
if ! grep -q "allowTTL:" "$CONFIG_FILE" || ! grep -q "denyTTL:" "$CONFIG_FILE" || ! grep -q "retryBackoff:" "$CONFIG_FILE"; then
  echo "❌ ImagePolicy configuration missing required TTL or retry settings"
  exit 1
fi

# Check if defaultAllow is set to false for security
DEFAULT_ALLOW=$(grep "defaultAllow:" "$CONFIG_FILE" | awk '{print $2}')
if [ "$DEFAULT_ALLOW" == "true" ]; then
  echo "❌ ImagePolicy defaultAllow is set to true, which is insecure"
  exit 1
fi

echo "✅ ImagePolicyWebhook configuration is correct"
exit 0 
#!/bin/bash
# Validate that encryption configuration file is valid

CONFIG_FILE="/etc/kubernetes/enc/enc.yaml"
RESOURCE_TYPE="secrets"
PROVIDER_TYPE="aescbc"

# Check if encryption configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ Encryption configuration file not found at $CONFIG_FILE"
  exit 1
fi

# Check if the file has correct structure with resources field
if ! grep -q "resources:" "$CONFIG_FILE"; then
  echo "❌ Encryption configuration file doesn't have 'resources' field"
  exit 1
fi

# Check if secrets are included in resources
if ! grep -q "$RESOURCE_TYPE" "$CONFIG_FILE"; then
  echo "❌ Encryption configuration doesn't include '$RESOURCE_TYPE'"
  exit 1
fi

# Check if aescbc provider type is configured
if ! grep -q "$PROVIDER_TYPE" "$CONFIG_FILE"; then
  echo "❌ Encryption configuration doesn't use '$PROVIDER_TYPE' provider"
  exit 1
fi

# Check if the configuration has a key for the aescbc provider
if ! grep -q "keys:" "$CONFIG_FILE"; then
  echo "❌ Encryption configuration doesn't define encryption keys"
  exit 1
fi

# Check if 'identity' provider exists but is not the first provider
IDENTITY_LINE=$(grep -n "- identity:" "$CONFIG_FILE" | cut -d: -f1)
AESCBC_LINE=$(grep -n "- aescbc:" "$CONFIG_FILE" | cut -d: -f1)

if [ -z "$IDENTITY_LINE" ]; then
  echo "❌ Encryption configuration doesn't include 'identity' provider"
  exit 1
fi

if [ -z "$AESCBC_LINE" ]; then
  echo "❌ Encryption configuration doesn't include 'aescbc' provider"
  exit 1
fi

if [ "$IDENTITY_LINE" -lt "$AESCBC_LINE" ]; then
  echo "❌ 'identity' provider is listed before 'aescbc', which means secrets won't be encrypted"
  exit 1
fi

echo "✅ Encryption configuration file is valid"
exit 0 
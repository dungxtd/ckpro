#!/bin/bash
# Validate that AppArmor profile exists

PROFILE_NAME="k8s-restricted"
PROFILE_PATH="/etc/apparmor.d/k8s-restricted"

# Check if AppArmor is installed
if ! command -v apparmor_parser &> /dev/null; then
  echo "❌ AppArmor is not installed on the system"
  exit 1
fi

# Check if AppArmor is enabled
if ! grep -q "Y" /sys/module/apparmor/parameters/enabled 2>/dev/null; then
  echo "❌ AppArmor is not enabled on the system"
  exit 1
fi

# Check if the profile file exists
if [ ! -f "$PROFILE_PATH" ]; then
  echo "❌ AppArmor profile file not found at $PROFILE_PATH"
  exit 1
fi

# Check if the profile is loaded
LOADED_PROFILE=$(grep -q "k8s-restricted" /sys/kernel/security/apparmor/profiles 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "❌ AppArmor profile '$PROFILE_NAME' is not loaded"
  exit 1
fi

# Check if the profile contains necessary content
if ! grep -q "network," "$PROFILE_PATH" || ! grep -q "file," "$PROFILE_PATH"; then
  echo "❌ AppArmor profile doesn't contain necessary restrictions"
  exit 1
fi

echo "✅ AppArmor profile exists and is loaded"
exit 0 
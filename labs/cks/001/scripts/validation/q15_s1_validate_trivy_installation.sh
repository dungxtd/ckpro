#!/bin/bash
# Validate that Trivy scanner is installed

# Check if trivy is installed
if ! command -v trivy &> /dev/null; then
  echo "❌ Trivy is not installed on the system"
  exit 1
fi

# Check if trivy version is correct (must be at least 0.18.0)
TRIVY_VERSION=$(trivy --version 2>&1 | grep -o "Version: [0-9.]*" | cut -d ' ' -f 2)
if [ -z "$TRIVY_VERSION" ]; then
  echo "❌ Could not determine Trivy version"
  exit 1
fi

# Split version into components
IFS='.' read -ra VERSION_PARTS <<< "$TRIVY_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}

# Check if version is at least 0.18.0
if [ "$MAJOR" -eq 0 ] && [ "$MINOR" -lt 18 ]; then
  echo "❌ Trivy version is too old: $TRIVY_VERSION. Required: at least 0.18.0"
  exit 1
fi

# Check if trivy can execute a basic scan
echo "Performing test scan..."
trivy --quiet image --no-progress --severity HIGH alpine:latest &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Trivy cannot perform a basic scan"
  exit 1
fi

echo "✅ Trivy is installed and working correctly"
exit 0 
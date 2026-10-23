#!/bin/bash
# Validate script for Question 4, Step 1: Check if nginx chart is installed

# Check if helm command is available
if ! command -v helm &> /dev/null; then
  echo "❌ Helm command not found in PATH"
  exit 1
fi

# Check if the release exists
release_info=$(helm list -n default -f "web-server" 2>&1)

if [ $? -ne 0 ] || ! echo "$release_info" | grep -q "web-server"; then
  echo "❌ Release 'web-server' not found in namespace 'default'"
  echo "Current releases:"
  helm list -n default
  exit 1
fi

# Check if it's using the Bitnami nginx chart
if ! helm get values web-server -n default | grep -q "nginx"; then
  echo "❌ Release 'web-server' does not appear to be using the nginx chart"
  echo "Release information:"
  echo "$release_info"
  exit 1
fi

echo "✅ Nginx chart is installed with release name 'web-server'"
echo "Release information:"
echo "$release_info"
exit 0 
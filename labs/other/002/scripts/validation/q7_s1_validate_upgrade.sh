#!/bin/bash
# Validate script for Question 7, Step 1: Check if release was upgraded

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

# Check if it's been upgraded (revision > 1)
revision=$(helm list -n default -f "web-server" -o json | jq -r '.[0].revision')

if [ -z "$revision" ] || [ "$revision" = "null" ]; then
  echo "❌ Could not determine revision for release 'web-server'"
  exit 1
fi

if [ "$revision" -le 1 ]; then
  echo "❌ Release 'web-server' has not been upgraded (revision: $revision)"
  exit 1
fi

echo "✅ Release 'web-server' has been upgraded to revision $revision"
exit 0 
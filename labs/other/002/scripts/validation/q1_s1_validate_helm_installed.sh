#!/bin/bash
# Validate script for Question 1, Step 1: Check if Helm version is saved correctly

# Check if the version file exists
if [ ! -f /tmp/exam/q1/helm-version.txt ]; then
  echo "❌ Helm version file does not exist at /tmp/exam/q1/helm-version.txt"
  exit 1
fi

# Check if the file has content
if [ ! -s /tmp/exam/q1/helm-version.txt ]; then
  echo "❌ Helm version file exists but is empty"
  exit 1
fi

# Check if the file contains Helm version information
if ! grep -q "version.BuildInfo" /tmp/exam/q1/helm-version.txt; then
  echo "❌ Helm version file does not contain client version information"
  echo "File content:"
  cat /tmp/exam/q1/helm-version.txt
  exit 1
fi

# Check for server connection (Tiller in v2 or Kubernetes API in v3)
if grep -q "Error" /tmp/exam/q1/helm-version.txt; then
  echo "❌ Helm version file shows connection errors"
  echo "File content:"
  cat /tmp/exam/q1/helm-version.txt
  exit 1
fi

echo "✅ Helm version saved correctly showing proper client and server information"
echo "File content:"
cat /tmp/exam/q1/helm-version.txt
exit 0 
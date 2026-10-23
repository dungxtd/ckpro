#!/bin/bash
# Validate script for Question 6, Step 2: Check if manifests summary is saved correctly

# Check if the manifests file exists
if [ ! -f /tmp/exam/q6/web-server-manifests.txt ]; then
  echo "❌ Manifests file does not exist at /tmp/exam/q6/web-server-manifests.txt"
  exit 1
fi

# Check if the file has content
if [ ! -s /tmp/exam/q6/web-server-manifests.txt ]; then
  echo "❌ Manifests file exists but is empty"
  exit 1
fi

# Check if the file contains Kubernetes manifest information
if ! grep -q "apiVersion\|kind\|metadata" /tmp/exam/q6/web-server-manifests.txt; then
  echo "❌ Manifests file does not contain Kubernetes manifest information"
  echo "Expected to find Kubernetes manifest contents with 'apiVersion', 'kind', 'metadata', etc."
  echo "File content:"
  cat /tmp/exam/q6/web-server-manifests.txt
  exit 1
fi

# Check if it contains the expected resource types for an nginx deployment
if ! grep -q "Deployment" /tmp/exam/q6/web-server-manifests.txt || \
   ! grep -q "Service" /tmp/exam/q6/web-server-manifests.txt; then
  echo "❌ Manifests file does not contain expected resource types"
  echo "Expected to find at least Deployment and Service resources"
  echo "File content snippet:"
  head -20 /tmp/exam/q6/web-server-manifests.txt
  exit 1
fi

echo "✅ Release manifests are correctly saved"
echo "Sample content:"
head -10 /tmp/exam/q6/web-server-manifests.txt
exit 0 
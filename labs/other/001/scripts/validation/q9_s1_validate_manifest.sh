#!/bin/bash
# Validate script for Question 9, Step 1: Check if manifest file exists

# Check if the manifest file exists
if [ ! -f /tmp/exam/q9/manifest.json ]; then
  echo "❌ Manifest file does not exist at /tmp/exam/q9/manifest.json"
  exit 1
fi

# Check if the manifest file has valid content
grep -q "\"mediaType\"" /tmp/exam/q9/manifest.json

if [ $? -eq 0 ]; then
  # Verify it's for nginx:1.21.0
  if grep -q "nginx:1.21.0" /tmp/exam/q9/manifest.json || grep -q "\"name\":\"nginx\"" /tmp/exam/q9/manifest.json; then
    echo "✅ Manifest file exists with valid content for nginx:1.21.0"
    exit 0
  else
    echo "❌ Manifest file exists but does not appear to be for nginx:1.21.0"
    exit 1
  fi
else
  echo "❌ Manifest file exists but does not have valid manifest content"
  exit 1
fi 
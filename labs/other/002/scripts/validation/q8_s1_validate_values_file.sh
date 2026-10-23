#!/bin/bash
# Validate script for Question 8, Step 1: Check if values file is created correctly

# Check if the values file exists
if [ ! -f /tmp/exam/q8/redis-values.yaml ]; then
  echo "❌ Values file does not exist at /tmp/exam/q8/redis-values.yaml"
  exit 1
fi

# Check if the file has content
if [ ! -s /tmp/exam/q8/redis-values.yaml ]; then
  echo "❌ Values file exists but is empty"
  exit 1
fi

# Check for password configuration
if ! grep -q "password.*password123" /tmp/exam/q8/redis-values.yaml; then
  echo "❌ Values file does not set the password to 'password123'"
  echo "File content:"
  cat /tmp/exam/q8/redis-values.yaml
  exit 1
fi

# Check for persistence enabled
if ! grep -q "persistence.*enabled.*true" /tmp/exam/q8/redis-values.yaml; then
  echo "❌ Values file does not enable persistence"
  echo "File content:"
  cat /tmp/exam/q8/redis-values.yaml
  exit 1
fi

# Check for resource limits
if ! grep -q "memory.*256Mi" /tmp/exam/q8/redis-values.yaml || ! grep -q "cpu.*100m" /tmp/exam/q8/redis-values.yaml; then
  echo "❌ Values file does not set correct resource limits"
  echo "Expected memory: 256Mi and cpu: 100m"
  echo "File content:"
  cat /tmp/exam/q8/redis-values.yaml
  exit 1
fi

echo "✅ Values file is created correctly with all required configurations"
echo "File content:"
cat /tmp/exam/q8/redis-values.yaml
exit 0 
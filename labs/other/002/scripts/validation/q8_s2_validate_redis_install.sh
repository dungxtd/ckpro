#!/bin/bash
# Validate script for Question 8, Step 2: Check if Redis chart is installed with correct values

# Check if helm command is available
if ! command -v helm &> /dev/null; then
  echo "❌ Helm command not found in PATH"
  exit 1
fi

# Check if the release exists
release_info=$(helm list -n default -f "cache-db" 2>&1)

if [ $? -ne 0 ] || ! echo "$release_info" | grep -q "cache-db"; then
  echo "❌ Release 'cache-db' not found in namespace 'default'"
  echo "Current releases:"
  helm list -n default
  exit 1
fi

# Check if it's using the Redis chart
chart=$(helm list -n default -f "cache-db" -o json | jq -r '.[0].chart')
if [[ "$chart" != *"redis"* ]]; then
  echo "❌ Release 'cache-db' is not using a Redis chart (chart: $chart)"
  exit 1
fi

# Check if the values were applied correctly
# 1. Check password
password_set=$(helm get values cache-db -n default -o json | jq -r '.password // empty')
if [ -z "$password_set" ] || [ "$password_set" != "password123" ]; then
  echo "❌ Redis password is not set to 'password123'"
  exit 1
fi

# 2. Check persistence
persistence_enabled=$(helm get values cache-db -n default -o json | jq -r '.persistence.enabled // empty')
if [ "$persistence_enabled" != "true" ]; then
  echo "❌ Redis persistence is not enabled"
  exit 1
fi

# 3. Check resources
memory_limit=$(helm get values cache-db -n default -o json | jq -r '.resources.limits.memory // empty')
cpu_limit=$(helm get values cache-db -n default -o json | jq -r '.resources.limits.cpu // empty')

if [ "$memory_limit" != "256Mi" ] || [ "$cpu_limit" != "100m" ]; then
  echo "❌ Redis resource limits are not set correctly"
  echo "Expected memory: 256Mi, found: $memory_limit"
  echo "Expected cpu: 100m, found: $cpu_limit"
  exit 1
fi

echo "✅ Redis chart is installed with correct values"
echo "Release information:"
echo "$release_info"
exit 0 
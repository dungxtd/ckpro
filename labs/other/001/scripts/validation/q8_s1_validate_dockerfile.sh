#!/bin/bash
# Validate script for Question 8, Step 1: Check if Dockerfile contains HEALTHCHECK instruction

# Check if the Dockerfile exists
if [ ! -f /tmp/exam/q8/Dockerfile ]; then
  echo "❌ Dockerfile does not exist at /tmp/exam/q8/Dockerfile"
  exit 1
fi

# Check if the Dockerfile has HEALTHCHECK
grep -q "HEALTHCHECK" /tmp/exam/q8/Dockerfile

if [ $? -eq 0 ]; then
  echo "✅ Dockerfile contains HEALTHCHECK instruction"
  
  # Check that it has appropriate parameters
  if grep -q "HEALTHCHECK.*--interval=30s" /tmp/exam/q8/Dockerfile && \
     grep -q "HEALTHCHECK.*--timeout=10s" /tmp/exam/q8/Dockerfile && \
     grep -q "HEALTHCHECK.*--start-period=5s" /tmp/exam/q8/Dockerfile && \
     grep -q "HEALTHCHECK.*--retries=3" /tmp/exam/q8/Dockerfile; then
    echo "✅ HEALTHCHECK includes all required parameters"
    exit 0
  else
    echo "❌ HEALTHCHECK is missing some required parameters"
    echo "Expected: --interval=30s --timeout=10s --start-period=5s --retries=3"
    echo "Found:"
    grep "HEALTHCHECK" /tmp/exam/q8/Dockerfile
    exit 1
  fi
else
  echo "❌ Dockerfile does not contain HEALTHCHECK instruction"
  exit 1
fi 
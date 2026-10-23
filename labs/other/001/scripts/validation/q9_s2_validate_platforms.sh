#!/bin/bash
# Validate script for Question 9, Step 2: Check if platforms file exists with correct data

# Check if the platforms file exists
if [ ! -f /tmp/exam/q9/platforms.txt ]; then
  echo "❌ Platforms file does not exist at /tmp/exam/q9/platforms.txt"
  exit 1
fi

# Check if the platforms file has valid content
grep -q "architecture\|os" /tmp/exam/q9/platforms.txt

if [ $? -eq 0 ]; then
  # Check that it has at least basic platform info
  if grep -q "amd64\|arm64\|linux" /tmp/exam/q9/platforms.txt; then
    echo "✅ Platforms file exists with valid content"
    exit 0
  else
    echo "❌ Platforms file exists but does not have expected platform information"
    echo "Expected to see architecture and OS information like 'amd64', 'arm64', or 'linux'"
    echo "Content:"
    cat /tmp/exam/q9/platforms.txt
    exit 1
  fi
else
  echo "❌ Platforms file exists but does not have valid platform content"
  echo "Content:"
  cat /tmp/exam/q9/platforms.txt
  exit 1
fi 
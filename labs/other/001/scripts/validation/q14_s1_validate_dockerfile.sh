#!/bin/bash
# Validate script for Question 14, Step 1: Check if Dockerfile exists with non-root user configuration

# Check if the Dockerfile exists
if [ ! -f /tmp/exam/q14/Dockerfile ]; then
  echo "❌ Dockerfile does not exist at /tmp/exam/q14/Dockerfile"
  exit 1
fi

# Check if the Dockerfile has USER instruction
grep -q "USER" /tmp/exam/q14/Dockerfile

if [ $? -ne 0 ]; then
  echo "❌ Dockerfile does not contain USER instruction"
  exit 1
fi

# Check if the USER is set to appuser
grep -q "USER.*appuser" /tmp/exam/q14/Dockerfile

if [ $? -ne 0 ]; then
  echo "❌ Dockerfile does not set USER to 'appuser'"
  exit 1
fi

# Check for user creation with UID 1001
grep -q "useradd.*1001" /tmp/exam/q14/Dockerfile || grep -q "adduser.*1001" /tmp/exam/q14/Dockerfile

if [ $? -ne 0 ]; then
  echo "❌ Dockerfile does not create a user with UID 1001"
  exit 1
fi

echo "✅ Dockerfile exists with non-root user configuration"
exit 0 
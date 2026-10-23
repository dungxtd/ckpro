#!/bin/bash
# Validate script for Question 6, Step 1: Check if release status is saved correctly

# Check if the status file exists
if [ ! -f /tmp/exam/q6/web-server-status.txt ]; then
  echo "❌ Release status file does not exist at /tmp/exam/q6/web-server-status.txt"
  exit 1
fi

# Check if the file has content
if [ ! -s /tmp/exam/q6/web-server-status.txt ]; then
  echo "❌ Release status file exists but is empty"
  exit 1
fi

# Check if the file contains Helm status information
if ! grep -q "NAME: web-server" /tmp/exam/q6/web-server-status.txt; then
  echo "❌ Status file does not contain information for release 'web-server'"
  echo "File content:"
  cat /tmp/exam/q6/web-server-status.txt
  exit 1
fi

# Check for key status sections
if ! grep -q "LAST DEPLOYED:" /tmp/exam/q6/web-server-status.txt || \
   ! grep -q "NAMESPACE:" /tmp/exam/q6/web-server-status.txt || \
   ! grep -q "STATUS:" /tmp/exam/q6/web-server-status.txt; then
  echo "❌ Status file does not contain complete status information"
  echo "Expected to find sections like 'LAST DEPLOYED', 'NAMESPACE', 'STATUS'"
  echo "File content:"
  cat /tmp/exam/q6/web-server-status.txt
  exit 1
fi

echo "✅ Release status is correctly saved"
echo "Sample content:"
head -10 /tmp/exam/q6/web-server-status.txt
exit 0 
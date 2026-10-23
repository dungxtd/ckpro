#!/bin/bash
# Validate script for Question 5, Step 1: Check if releases list is saved correctly

# Check if the releases file exists
if [ ! -f /tmp/exam/q5/releases.txt ]; then
  echo "❌ Releases list file does not exist at /tmp/exam/q5/releases.txt"
  exit 1
fi

# Check if the file has content
if [ ! -s /tmp/exam/q5/releases.txt ]; then
  echo "❌ Releases list file exists but is empty"
  exit 1
fi

# Get current releases to compare
current_releases=$(helm list -A 2>/dev/null)

# Check if the file contains Helm release information
if ! grep -q "NAME\|NAMESPACE\|REVISION\|STATUS" /tmp/exam/q5/releases.txt; then
  echo "❌ Releases list file does not appear to be from helm list command"
  echo "Expected headers like 'NAME', 'NAMESPACE', 'REVISION', 'STATUS'"
  echo "File content:"
  cat /tmp/exam/q5/releases.txt
  exit 1
fi

# Check if the file contains the web-server release we created in Q4
if ! grep -q "web-server" /tmp/exam/q5/releases.txt; then
  echo "❌ Releases list file does not contain the 'web-server' release"
  echo "File content:"
  cat /tmp/exam/q5/releases.txt
  exit 1
fi

# Check if the command was run with -A flag to show all namespaces
# This is a bit lenient as it just checks if there are entries from 
# namespaces other than default, if they exist
if [ $(helm list -A | grep -v "default" | wc -l) -gt 0 ]; then
  if ! grep -v "default" /tmp/exam/q5/releases.txt > /dev/null; then
    echo "❌ Releases list does not include releases from all namespaces"
    echo "File content might not have been generated with 'helm list -A'"
    exit 1
  fi
fi

echo "✅ Helm releases list is correctly saved"
echo "Sample content:"
head -5 /tmp/exam/q5/releases.txt
exit 0 
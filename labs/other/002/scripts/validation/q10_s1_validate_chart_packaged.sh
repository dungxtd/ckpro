#!/bin/bash
# Validate script for Question 10, Step 1: Check if chart is packaged

# Check if the packaged chart is in the current directory
if ! ls webapp-*.tgz &>/dev/null; then
  # Check if it was moved to the repository directory already
  if ! ls /tmp/exam/q10/charts/webapp-*.tgz &>/dev/null; then
    echo "❌ Packaged chart (webapp-*.tgz) not found in current directory or repository directory"
    echo "Current directory contents:"
    ls -la
    echo "Repository directory contents (if exists):"
    ls -la /tmp/exam/q10/charts 2>/dev/null || echo "Repository directory does not exist yet"
    exit 1
  else
    echo "✅ Chart is packaged and moved to the repository directory"
    echo "Repository directory contents:"
    ls -la /tmp/exam/q10/charts
    exit 0
  fi
fi

echo "✅ Chart is packaged (but not yet moved to repository directory)"
echo "Current directory contents:"
ls -la webapp-*.tgz
exit 0 
#!/bin/bash
# Validate script for Question 12, Step 1: Check if report file exists

# Check if the report file exists
if [ ! -f /tmp/exam/q12/image-report.txt ]; then
  echo "❌ Image report file does not exist at /tmp/exam/q12/image-report.txt"
  exit 1
fi

# Check if the report file has content
if [ ! -s /tmp/exam/q12/image-report.txt ]; then
  echo "❌ Image report file exists but is empty"
  exit 1
fi

echo "✅ Image report file exists and has content"
exit 0 
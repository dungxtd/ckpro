#!/bin/bash
# Validate script for Question 3, Step 1: Check if nginx chart search results are saved

# Check if the results file exists
if [ ! -f /tmp/exam/q3/nginx-charts.txt ]; then
  echo "❌ Search results file does not exist at /tmp/exam/q3/nginx-charts.txt"
  exit 1
fi

# Check if the file has content
if [ ! -s /tmp/exam/q3/nginx-charts.txt ]; then
  echo "❌ Search results file exists but is empty"
  exit 1
fi

# Check if the file contains nginx chart information from Bitnami
if ! grep -q "bitnami/nginx" /tmp/exam/q3/nginx-charts.txt; then
  echo "❌ Search results file does not contain Bitnami nginx chart information"
  echo "File content:"
  cat /tmp/exam/q3/nginx-charts.txt
  exit 1
fi

# Check if the file appears to be the output of a helm search command
if ! grep -q "NAME\|VERSION\|DESCRIPTION" /tmp/exam/q3/nginx-charts.txt; then
  echo "❌ Search results file does not appear to be from helm search command"
  echo "Expected headers like 'NAME', 'VERSION', 'DESCRIPTION'"
  echo "File content:"
  cat /tmp/exam/q3/nginx-charts.txt
  exit 1
fi

echo "✅ Nginx chart search results are correctly saved"
echo "Sample content:"
head -5 /tmp/exam/q3/nginx-charts.txt
exit 0 
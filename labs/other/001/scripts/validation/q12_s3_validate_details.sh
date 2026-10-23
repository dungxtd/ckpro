#!/bin/bash
# Validate script for Question 12, Step 3: Check if report contains all required details

# Check if the report file exists
if [ ! -f /tmp/exam/q12/image-report.txt ]; then
  echo "❌ Image report file does not exist at /tmp/exam/q12/image-report.txt"
  exit 1
fi

# Initialize a score
score=0
total_checks=4

# Check for layers information
if grep -i "layers\|layer" /tmp/exam/q12/image-report.txt > /dev/null; then
  echo "✅ Report contains information about layers"
  ((score++))
else
  echo "❌ Report is missing information about the number of layers"
fi

# Check for ports information
if grep -i "port\|expose" /tmp/exam/q12/image-report.txt > /dev/null; then
  echo "✅ Report contains information about exposed ports"
  ((score++))
else
  echo "❌ Report is missing information about exposed ports"
fi

# Check for environment variables
if grep -i "environment\|env" /tmp/exam/q12/image-report.txt > /dev/null; then
  echo "✅ Report contains information about environment variables"
  ((score++))
else
  echo "❌ Report is missing information about environment variables"
fi

# Check for entrypoint
if grep -i "entrypoint\|cmd\|command" /tmp/exam/q12/image-report.txt > /dev/null; then
  echo "✅ Report contains information about entrypoint/command"
  ((score++))
else
  echo "❌ Report is missing information about entrypoint/command"
fi

# Check overall score (require at least 3 of 4 checks to pass)
if [ $score -ge 3 ]; then
  echo "✅ Report contains most of the required information ($score/$total_checks checks passed)"
  exit 0
else
  echo "❌ Report is missing too much required information (only $score/$total_checks checks passed)"
  exit 1
fi 
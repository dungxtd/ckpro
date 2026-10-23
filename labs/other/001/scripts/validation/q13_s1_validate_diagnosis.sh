#!/bin/bash
# Validate script for Question 13, Step 1: Check if diagnosis file exists

# Check if the diagnosis file exists
if [ ! -f /tmp/exam/q13/diagnosis.txt ]; then
  echo "❌ Diagnosis file does not exist at /tmp/exam/q13/diagnosis.txt"
  exit 1
fi

# Check if the diagnosis file has content
if [ ! -s /tmp/exam/q13/diagnosis.txt ]; then
  echo "❌ Diagnosis file exists but is empty"
  exit 1
fi

# Check if the diagnosis file mentions the config.json file that's missing
if grep -q "config.json\|configuration" /tmp/exam/q13/diagnosis.txt; then
  echo "✅ Diagnosis file mentions the missing configuration file"
  exit 0
else
  echo "❌ Diagnosis file does not mention the missing config.json file"
  echo "Content:"
  cat /tmp/exam/q13/diagnosis.txt
  exit 1
fi 
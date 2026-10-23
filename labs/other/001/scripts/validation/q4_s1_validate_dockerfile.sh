#!/bin/bash
# Validate script for Question 4, Step 1: Check if Dockerfile exists and has multiple stages

# Check if the Dockerfile exists
if [ ! -f /tmp/exam/q4/Dockerfile ]; then
  echo "❌ Dockerfile does not exist at /tmp/exam/q4/Dockerfile"
  exit 1
fi

# Check if the Dockerfile has multiple stages
stages=$(grep -c "FROM" /tmp/exam/q4/Dockerfile)

if [ "$stages" -ge 2 ]; then
  echo "✅ Dockerfile exists and has multiple stages ($stages stages detected)"
  exit 0
else
  echo "❌ Dockerfile does not have multiple stages (found $stages FROM statements, need at least 2)"
  exit 1
fi 
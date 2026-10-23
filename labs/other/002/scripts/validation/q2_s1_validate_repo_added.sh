#!/bin/bash
# Validate script for Question 2, Step 1: Check if Bitnami repo is added

# Check if helm command is available
if ! command -v helm &> /dev/null; then
  echo "❌ Helm command not found in PATH"
  exit 1
fi

# Get the list of repositories
repo_list=$(helm repo list 2>&1)

# Check if the command was successful
if [ $? -ne 0 ]; then
  echo "❌ Failed to list Helm repositories"
  echo "Error: $repo_list"
  exit 1
fi

# Check if Bitnami repo is in the list
if ! echo "$repo_list" | grep -q "bitnami"; then
  echo "❌ Bitnami repository not found in Helm repositories"
  echo "Current repositories:"
  echo "$repo_list"
  exit 1
fi

# Check if the URL is correct
if ! echo "$repo_list" | grep -q "bitnami.*https://charts.bitnami.com/bitnami"; then
  echo "❌ Bitnami repository found but URL is incorrect"
  echo "Current repositories:"
  echo "$repo_list"
  exit 1
fi

echo "✅ Bitnami repository is properly added to Helm"
echo "Repository list:"
echo "$repo_list"
exit 0 
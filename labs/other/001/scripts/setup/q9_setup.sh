#!/bin/bash
# Setup script for Question 9: Docker image manifests

# Create directory for output
mkdir -p /tmp/exam/q9

# Ensure we have access to the manifest command
export DOCKER_CLI_EXPERIMENTAL=enabled

# Clean up any existing files
rm -f /tmp/exam/q9/manifest.json /tmp/exam/q9/platforms.txt

echo "Setup for Question 9 complete."
exit 0 
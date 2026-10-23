#!/bin/bash
# Setup script for Question 6: Docker logging configuration

# Ensure nginx:alpine image is available
docker pull nginx:alpine &> /dev/null

# Remove any existing container with the same name
docker rm -f logging-test &> /dev/null

echo "Setup for Question 6 complete."
exit 0 
#!/bin/bash
# Setup script for Question 7: Docker networking

# Remove any existing network with the same name
docker network rm app-network &> /dev/null

# Remove any existing containers
docker rm -f app1 app2 &> /dev/null

# Ensure alpine image is available
docker pull alpine:latest &> /dev/null

echo "Setup for Question 7 complete."
exit 0 
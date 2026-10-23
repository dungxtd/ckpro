#!/bin/bash
# Setup script for Question 16: Docker Content Trust

# Create directory for command file
mkdir -p /tmp/exam/q16

# Set up a local registry if not already running
if ! docker ps | grep -q registry; then
    echo "Setting up local registry..."
    docker run -d -p 5000:5000 --name registry registry:2
fi

# Ensure any old DCT settings are cleared
export DOCKER_CONTENT_TRUST=0

# Ensure directory for notary exists
mkdir -p ~/.docker/trust

# Create a simple app for signing
mkdir -p /tmp/exam/q16/secure-app
cat > /tmp/exam/q16/secure-app/Dockerfile << EOF
FROM alpine:latest
CMD ["echo", "This is a signed secure image"]
EOF

# Remove any existing files
rm -f /tmp/exam/q16/dct-commands.sh

echo "Setup for Question 16 complete."
exit 0 
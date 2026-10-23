#!/bin/bash
# Setup script for Question 5: Docker daemon configuration

# Backup original daemon.json if it exists
if [ -f /etc/docker/daemon.json ]; then
  cp /etc/docker/daemon.json /etc/docker/daemon.json.backup
else
  # Create empty daemon.json
  mkdir -p /etc/docker
  echo "{}" > /etc/docker/daemon.json
fi

# Create a reference file with expected content
mkdir -p /tmp/exam/q5
cat > /tmp/exam/q5/reference.json << EOF
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
  "storage-driver": "overlay2"
}
EOF

echo "Setup for Question 5 complete."
exit 0 
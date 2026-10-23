#!/bin/bash
# Setup for Question 2: Static Pod setup

# Ensure the static pod directory exists
mkdir -p /etc/kubernetes/manifests/

# Remove any existing static pod with the same name
rm -f /etc/kubernetes/manifests/static-web.yaml

exit 0 
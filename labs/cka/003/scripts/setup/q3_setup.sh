#!/bin/bash
set -e

# The real etcd cluster (Part A infra change) and client certs at
# /root/.ckdry/etcd/k8s already exist cluster-wide, nothing to provision here.
mkdir -p /tmp/exam

echo "Setup completed for Question 3"

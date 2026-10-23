#!/bin/bash
set -e

# PersistentVolumes are cluster-scoped, but create a namespace for organizational
# consistency with the rest of the lab.
kubectl create namespace storage-pv --dry-run=client -o yaml | kubectl apply -f -

echo "Setup completed for Question 10"

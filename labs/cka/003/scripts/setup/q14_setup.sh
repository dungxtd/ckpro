#!/bin/bash
set -e

kubectl create namespace storage-pvc --dry-run=client -o yaml | kubectl apply -f -

echo "Setup completed for Question 14"

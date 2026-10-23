#!/bin/bash
set -e

kubectl create namespace multi-container --dry-run=client -o yaml | kubectl apply -f -

echo "Setup completed for Question 9"

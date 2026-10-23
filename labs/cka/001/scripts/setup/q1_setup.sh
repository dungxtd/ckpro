#!/bin/bash
# Setup for Question 1: Create namespace and pod

# No specific setup needed as this is a creation task
# Just ensure the namespace doesn't exist already
kubectl delete namespace app-team1 --ignore-not-found=true

exit 0 
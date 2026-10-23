#!/bin/bash
set -e

kubectl get serviceaccount cicd-token -n app-team1 || {
    echo "ServiceAccount cicd-token not found in namespace app-team1"
    exit 1
}

echo "ServiceAccount cicd-token validation successful"
exit 0

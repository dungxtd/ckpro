#!/bin/bash
set -e

kubectl get ingress pong -n ing-internal || {
    echo "Ingress pong not found in namespace ing-internal"
    exit 1
}

echo "Ingress pong exists"
exit 0

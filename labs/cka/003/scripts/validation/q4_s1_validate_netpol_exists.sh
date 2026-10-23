#!/bin/bash
set -e

kubectl get networkpolicy allow-port-from-namespace -n fubar || {
    echo "NetworkPolicy allow-port-from-namespace not found in namespace fubar"
    exit 1
}

echo "NetworkPolicy exists"
exit 0

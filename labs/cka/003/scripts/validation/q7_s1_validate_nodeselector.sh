#!/bin/bash
set -e

kubectl get pod nginx-kusc00401 -n scheduling || {
    echo "Pod nginx-kusc00401 not found in namespace scheduling"
    exit 1
}

DISK_SELECTOR=$(kubectl get pod nginx-kusc00401 -n scheduling -o jsonpath='{.spec.nodeSelector.disk}')
if [[ "$DISK_SELECTOR" != "ssd" ]]; then
    echo "Pod does not have nodeSelector disk=ssd (got '$DISK_SELECTOR')"
    exit 1
fi

echo "nodeSelector validation successful"
exit 0

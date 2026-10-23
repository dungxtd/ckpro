#!/bin/bash
set -e

kubectl get pod big-corp-app -n logging || {
    echo "Pod big-corp-app not found in namespace logging"
    exit 1
}

COUNT=$(kubectl get pod big-corp-app -n logging -o jsonpath='{.spec.containers[*].name}' | wc -w)
if [[ "$COUNT" -ne 2 ]]; then
    echo "Pod big-corp-app does not have exactly 2 containers (got $COUNT)"
    exit 1
fi

echo "big-corp-app container count validation successful"
exit 0

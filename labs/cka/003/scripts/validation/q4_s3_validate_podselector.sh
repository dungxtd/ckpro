#!/bin/bash
set -e

NP=$(kubectl get networkpolicy allow-port-from-namespace -n fubar -o json)

POD_SELECTOR=$(echo "$NP" | jq -c '.spec.podSelector')
if [[ "$POD_SELECTOR" != "{}" ]]; then
    echo "podSelector should be empty (match all pods in fubar) to make the policy namespace-wide, got: $POD_SELECTOR"
    exit 1
fi

echo "podSelector validation successful (namespace-wide policy)"
exit 0

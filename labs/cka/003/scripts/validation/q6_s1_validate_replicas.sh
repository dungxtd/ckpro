#!/bin/bash
set -e

kubectl get deployment presentation -n default || {
    echo "Deployment presentation not found in namespace default"
    exit 1
}

SPEC_REPLICAS=$(kubectl get deployment presentation -n default -o jsonpath='{.spec.replicas}')
if [[ "$SPEC_REPLICAS" != "3" ]]; then
    echo "Deployment presentation spec.replicas is not 3 (got '$SPEC_REPLICAS')"
    exit 1
fi

# Scaling isn't instant, poll for readiness up to 60s
WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    READY=$(kubectl get deployment presentation -n default -o jsonpath='{.status.readyReplicas}')
    if [[ "$READY" == "3" ]]; then
        echo "Deployment presentation scaled to 3 ready replicas"
        exit 0
    fi
    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

echo "Deployment presentation does not have 3 readyReplicas (got '$READY')"
exit 1

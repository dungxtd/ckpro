#!/bin/bash
set -e

kubectl get pv app-data || {
    echo "PersistentVolume app-data not found"
    exit 1
}

PV=$(kubectl get pv app-data -o json)

CAPACITY=$(echo "$PV" | jq -r '.spec.capacity.storage')
if [[ "$CAPACITY" != "2Gi" ]]; then
    echo "Incorrect capacity. Expected 2Gi, got '$CAPACITY'"
    exit 1
fi

ACCESS_MODE=$(echo "$PV" | jq -r '.spec.accessModes[0]')
if [[ "$ACCESS_MODE" != "ReadWriteOnce" ]]; then
    echo "Incorrect access mode. Expected ReadWriteOnce, got '$ACCESS_MODE'"
    exit 1
fi

HOSTPATH=$(echo "$PV" | jq -r '.spec.hostPath.path')
if [[ "$HOSTPATH" != "/srv/app-data" ]]; then
    echo "Incorrect hostPath. Expected /srv/app-data, got '$HOSTPATH'"
    exit 1
fi

echo "PersistentVolume app-data validation successful"
exit 0

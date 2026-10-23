#!/bin/bash
set -e

kubectl get pvc pv-volume -n storage-pvc || {
    echo "PVC pv-volume not found in namespace storage-pvc"
    exit 1
}

SC=$(kubectl get pvc pv-volume -n storage-pvc -o jsonpath='{.spec.storageClassName}')
if [[ "$SC" != "csi-hostpath-sc" ]]; then
    echo "PVC pv-volume does not use StorageClass csi-hostpath-sc (got '$SC')"
    exit 1
fi

ACCESS_MODE=$(kubectl get pvc pv-volume -n storage-pvc -o jsonpath='{.spec.accessModes[0]}')
if [[ "$ACCESS_MODE" != "ReadWriteOnce" ]]; then
    echo "PVC pv-volume access mode is not ReadWriteOnce (got '$ACCESS_MODE')"
    exit 1
fi

echo "PVC storageClass/accessMode validation successful"
exit 0

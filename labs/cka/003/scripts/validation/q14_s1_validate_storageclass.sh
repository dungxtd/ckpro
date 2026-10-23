#!/bin/bash
set -e

kubectl get storageclass csi-hostpath-sc || {
    echo "StorageClass csi-hostpath-sc not found"
    exit 1
}

EXPANSION=$(kubectl get storageclass csi-hostpath-sc -o jsonpath='{.allowVolumeExpansion}')
if [[ "$EXPANSION" != "true" ]]; then
    echo "StorageClass csi-hostpath-sc does not have allowVolumeExpansion=true (got '$EXPANSION')"
    exit 1
fi

echo "StorageClass validation successful"
exit 0

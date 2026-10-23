#!/bin/bash
set -e

kubectl get pod web-server -n storage-pvc || {
    echo "Pod web-server not found in namespace storage-pvc"
    exit 1
}

MOUNT_PATH=$(kubectl get pod web-server -n storage-pvc -o jsonpath='{.spec.containers[0].volumeMounts[?(@.mountPath=="/usr/share/nginx/html")].mountPath}')
if [[ "$MOUNT_PATH" != "/usr/share/nginx/html" ]]; then
    echo "Pod web-server does not mount a volume at /usr/share/nginx/html"
    exit 1
fi

CLAIM_NAME=$(kubectl get pod web-server -n storage-pvc -o jsonpath='{.spec.volumes[?(@.persistentVolumeClaim.claimName=="pv-volume")].persistentVolumeClaim.claimName}')
if [[ "$CLAIM_NAME" != "pv-volume" ]]; then
    echo "Pod web-server does not reference PVC pv-volume"
    exit 1
fi

WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    PHASE=$(kubectl get pod web-server -n storage-pvc -o jsonpath='{.status.phase}' 2>/dev/null || true)
    if [[ "$PHASE" == "Running" ]]; then
        echo "Pod web-server validation successful"
        exit 0
    fi
    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

echo "Pod web-server is not Running (phase='$PHASE')"
exit 1

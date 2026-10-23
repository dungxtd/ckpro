#!/bin/bash
set -e

POD=$(kubectl get pod big-corp-app -n logging -o json)

SIDECAR_IMAGE=$(echo "$POD" | jq -r '.spec.containers[] | select(.name=="sidecar") | .image')
if [[ -z "$SIDECAR_IMAGE" ]]; then
    echo "Pod big-corp-app has no container named 'sidecar'"
    exit 1
fi
if [[ "$SIDECAR_IMAGE" != *"busybox"* ]]; then
    echo "sidecar container does not use busybox image (got '$SIDECAR_IMAGE')"
    exit 1
fi

MOUNT_PATH=$(echo "$POD" | jq -r '.spec.containers[] | select(.name=="sidecar") | .volumeMounts[]? | select(.mountPath=="/var/log") | .mountPath')
if [[ "$MOUNT_PATH" != "/var/log" ]]; then
    echo "sidecar container does not mount /var/log"
    exit 1
fi

VOLUME_NAME=$(echo "$POD" | jq -r '.spec.containers[] | select(.name=="sidecar") | .volumeMounts[]? | select(.mountPath=="/var/log") | .name')
ORIG_VOLUME_NAME=$(echo "$POD" | jq -r '.spec.containers[] | select(.name=="count") | .volumeMounts[]? | select(.mountPath=="/var/log") | .name')
if [[ -z "$VOLUME_NAME" || "$VOLUME_NAME" != "$ORIG_VOLUME_NAME" ]]; then
    echo "sidecar does not mount the same volume as the original container at /var/log"
    exit 1
fi

echo "sidecar container validation successful"
exit 0

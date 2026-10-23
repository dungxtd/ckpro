#!/bin/bash
set -e

ING=$(kubectl get ingress pong -n ing-internal -o json)

PATH_ENTRY=$(echo "$ING" | jq -c '[.spec.rules[]?.http.paths[]? | select(.path=="/hello")] | first')
if [[ -z "$PATH_ENTRY" || "$PATH_ENTRY" == "null" ]]; then
    echo "Ingress pong has no rule for path /hello"
    exit 1
fi

PATH_TYPE=$(echo "$PATH_ENTRY" | jq -r '.pathType')
if [[ "$PATH_TYPE" != "Prefix" ]]; then
    echo "Path /hello pathType is not Prefix (got '$PATH_TYPE')"
    exit 1
fi

BACKEND_SVC=$(echo "$PATH_ENTRY" | jq -r '.backend.service.name')
if [[ "$BACKEND_SVC" != "hello" ]]; then
    echo "Path /hello does not route to service 'hello' (got '$BACKEND_SVC')"
    exit 1
fi

BACKEND_PORT=$(echo "$PATH_ENTRY" | jq -r '.backend.service.port.number')
if [[ "$BACKEND_PORT" != "5678" ]]; then
    echo "Path /hello does not route to port 5678 (got '$BACKEND_PORT')"
    exit 1
fi

echo "Ingress rule validation successful"
exit 0

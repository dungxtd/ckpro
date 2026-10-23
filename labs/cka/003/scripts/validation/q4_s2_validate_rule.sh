#!/bin/bash
set -e

NP=$(kubectl get networkpolicy allow-port-from-namespace -n fubar -o json)

POLICY_TYPES=$(echo "$NP" | jq -r '.spec.policyTypes[]')
if ! echo "$POLICY_TYPES" | grep -q "Ingress"; then
    echo "NetworkPolicy does not include Ingress in policyTypes"
    exit 1
fi

# Exactly one ingress rule, restricted to namespaceSelector matching "internal"
NS_MATCH=$(echo "$NP" | jq -r '.spec.ingress[]?.from[]?.namespaceSelector.matchLabels["kubernetes.io/metadata.name"] // empty')
if [[ "$NS_MATCH" != "internal" ]]; then
    echo "Ingress rule does not restrict source to namespaceSelector matching namespace 'internal' (got '$NS_MATCH')"
    exit 1
fi

PORT=$(echo "$NP" | jq -r '.spec.ingress[]?.ports[]?.port // empty')
PROTO=$(echo "$NP" | jq -r '.spec.ingress[]?.ports[]?.protocol // empty')
if [[ "$PORT" != "9000" || "$PROTO" != "TCP" ]]; then
    echo "Ingress rule does not restrict to port 9000/TCP (got port='$PORT' protocol='$PROTO')"
    exit 1
fi

echo "NetworkPolicy ingress rule validation successful"
exit 0

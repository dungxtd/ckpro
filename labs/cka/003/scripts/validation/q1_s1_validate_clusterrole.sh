#!/bin/bash
set -e

kubectl get clusterrole deployment-clusterrole || {
    echo "ClusterRole deployment-clusterrole not found"
    exit 1
}

RULES=$(kubectl get clusterrole deployment-clusterrole -o json)

for RESOURCE in deployments statefulsets daemonsets; do
    RULE=$(echo "$RULES" | jq -r --arg r "$RESOURCE" '.rules[] | select(.resources[]? == $r)')
    if [[ -z "$RULE" ]]; then
        echo "ClusterRole is missing a rule for resource '$RESOURCE'"
        exit 1
    fi
    if ! echo "$RULE" | jq -e '.verbs | index("create")' > /dev/null; then
        echo "ClusterRole rule for '$RESOURCE' does not allow 'create'"
        exit 1
    fi
done

echo "ClusterRole deployment-clusterrole validation successful"
exit 0

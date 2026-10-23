#!/bin/bash
set -e

# There must be a RoleBinding (namespace-scoped) in app-team1 referencing the
# deployment-clusterrole ClusterRole and the cicd-token ServiceAccount
FOUND=0
for RB in $(kubectl get rolebinding -n app-team1 -o jsonpath='{.items[*].metadata.name}'); do
    ROLE_KIND=$(kubectl get rolebinding "$RB" -n app-team1 -o jsonpath='{.roleRef.kind}')
    ROLE_NAME=$(kubectl get rolebinding "$RB" -n app-team1 -o jsonpath='{.roleRef.name}')
    SA_NAME=$(kubectl get rolebinding "$RB" -n app-team1 -o jsonpath='{.subjects[?(@.kind=="ServiceAccount")].name}')
    if [[ "$ROLE_KIND" == "ClusterRole" && "$ROLE_NAME" == "deployment-clusterrole" && "$SA_NAME" == *"cicd-token"* ]]; then
        FOUND=1
        break
    fi
done

if [[ "$FOUND" -ne 1 ]]; then
    echo "No RoleBinding in app-team1 binds ClusterRole deployment-clusterrole to ServiceAccount cicd-token"
    exit 1
fi

# Must be able to create deployments in app-team1
# (kubectl auth can-i exits 1 for "no" answers, so guard with `|| true` under set -e)
CAN_APP_TEAM1=$(kubectl auth can-i create deployments -n app-team1 --as=system:serviceaccount:app-team1:cicd-token) || true
if [[ "$CAN_APP_TEAM1" != "yes" ]]; then
    echo "cicd-token cannot create deployments in app-team1 (expected yes, got $CAN_APP_TEAM1)"
    exit 1
fi

# Must NOT be able to create deployments in default (proves it's namespace-scoped, not cluster-wide)
CAN_DEFAULT=$(kubectl auth can-i create deployments -n default --as=system:serviceaccount:app-team1:cicd-token) || true
if [[ "$CAN_DEFAULT" != "no" ]]; then
    echo "cicd-token should NOT be able to create deployments in default (expected no, got $CAN_DEFAULT) - binding must be namespace-scoped"
    exit 1
fi

echo "RBAC scope validation successful"
exit 0

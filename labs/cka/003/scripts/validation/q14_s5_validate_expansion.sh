#!/bin/bash
set -e

# NOTE: rancher.io/local-path does not actually support live filesystem expansion,
# so this only checks that the PVC's *declared* requested size was patched to 70Mi,
# matching how the real CKA exam also only checks the object was patched.
REQUEST=$(kubectl get pvc pv-volume -n storage-pvc -o jsonpath='{.spec.resources.requests.storage}')
if [[ "$REQUEST" != "70Mi" ]]; then
    echo "PVC pv-volume requested storage is not 70Mi (got '$REQUEST')"
    exit 1
fi

echo "PVC expansion validation successful"
exit 0

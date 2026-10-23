#!/bin/bash
set -e

SNAPSHOT=/tmp/exam/etcd-snapshot.db

if [[ ! -f "$SNAPSHOT" ]]; then
    echo "Snapshot file $SNAPSHOT does not exist"
    exit 1
fi

SIZE=$(stat -c%s "$SNAPSHOT" 2>/dev/null || stat -f%z "$SNAPSHOT" 2>/dev/null)
if [[ -z "$SIZE" || "$SIZE" -lt 1024 ]]; then
    echo "Snapshot file $SNAPSHOT is missing or too small ($SIZE bytes) to be a real etcd snapshot"
    exit 1
fi

ETCDCTL_API=3 etcdctl snapshot status "$SNAPSHOT" \
  --cacert=/root/.ckdry/etcd/k8s/ca.crt \
  --cert=/root/.ckdry/etcd/k8s/client.crt \
  --key=/root/.ckdry/etcd/k8s/client.key \
  --write-out=table > /dev/null 2>&1 || {
    echo "etcdctl snapshot status reported the snapshot file is not a valid etcd snapshot"
    exit 1
}

echo "etcd snapshot validation successful"
exit 0

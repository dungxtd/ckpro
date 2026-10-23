#!/bin/bash
set -e

# NOTE: this environment has no node-level access to swap a restored data directory
# into the live etcd static pod, so this check can only confirm that
# `etcdctl snapshot restore` produced a structurally valid etcd data directory -
# it does NOT (and cannot) verify the restored data was live-applied to the cluster.

RESTORE_DIR=/tmp/exam/etcd-restored

if [[ ! -d "$RESTORE_DIR" ]]; then
    echo "Restore directory $RESTORE_DIR does not exist"
    exit 1
fi

if [[ ! -d "$RESTORE_DIR/member/snap" ]]; then
    echo "Restore directory $RESTORE_DIR does not look like a valid etcd data directory (missing member/snap)"
    exit 1
fi

echo "etcd restore directory validation successful"
exit 0

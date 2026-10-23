#!/bin/bash
set -e

# Create namespace
kubectl create namespace node-ops --dry-run=client -o yaml | kubectl apply -f -

# Dynamically pick a worker (non control-plane) node to be the drain target
TARGET_NODE=$(kubectl get nodes -l '!node-role.kubernetes.io/control-plane' -o jsonpath='{.items[0].metadata.name}')
if [ -z "$TARGET_NODE" ]; then
  echo "No worker node found to label as drain-target"
  exit 1
fi

echo "Labeling node $TARGET_NODE with drain-target=true"
kubectl label node "$TARGET_NODE" drain-target=true --overwrite

# Hard (NoSchedule) taint so unrelated pods from OTHER questions (including
# candidate-authored bare Pods with no controller, e.g. Q9's kucc8, and other
# setup-created bare Pods, e.g. Q13's overloaded-cpu-*) can never land on this
# node. This does not block Q2's own drain-target Deployment below - it
# explicitly tolerates all taints (`operator: "Exists"`) - and it doesn't
# block cordon/drain themselves, which only affect NEW scheduling decisions,
# not eviction. A softer PreferNoSchedule taint was tried first but is only a
# scheduler preference, not a guarantee, and still let unrelated bare Pods land
# here often enough in testing to matter: if an unrelated bare Pod ends up here
# and the candidate later legitimately drains this node for Q2, that Pod would
# be evicted and (having no controller) never rescheduled, permanently failing
# its own question.
kubectl taint node "$TARGET_NODE" drain-target=true:NoSchedule --overwrite

# Deploy a workload pinned to the labeled node so there is something real to drain/reschedule
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: drain-target
  namespace: node-ops
  labels:
    app: drain-target
spec:
  replicas: 3
  selector:
    matchLabels:
      app: drain-target
  template:
    metadata:
      labels:
        app: drain-target
    spec:
      nodeSelector:
        drain-target: "true"
      tolerations:
        - operator: "Exists"
      containers:
        - name: pause
          image: busybox:1.36
          command: ["sh", "-c", "sleep 3600"]
EOF

echo "Waiting for drain-target deployment pods to be scheduled on $TARGET_NODE..."
kubectl wait --for=condition=available --timeout=120s deployment/drain-target -n node-ops || {
  echo "WARNING: drain-target deployment did not become available in time, continuing anyway"
}

# The nodeSelector was only needed to force initial placement onto the target node.
# Remove it now so that once the candidate drains/cordons the node, the ReplicaSet's
# replacement pods are free to be rescheduled onto any other schedulable node
# (mirrors real-world workloads, which are not normally hard-pinned to a single node).
kubectl patch deployment drain-target -n node-ops --type='json' \
  -p='[{"op": "remove", "path": "/spec/template/spec/nodeSelector"}]' || {
  echo "WARNING: could not remove nodeSelector from drain-target deployment, continuing anyway"
}

echo "Setup completed for Question 2"

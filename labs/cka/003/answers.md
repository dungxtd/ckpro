# CKA Exam Solutions

This document contains detailed solutions for the CKA exam scenario pack (cka-003). Each solution includes the exact commands/manifests needed and a short explanation of why the approach is correct.

## Question 1: RBAC for a CI/CD ServiceAccount

### Solution
```bash
kubectl create clusterrole deployment-clusterrole \
  --verb=create --resource=deployments,statefulsets,daemonsets

kubectl create serviceaccount cicd-token -n app-team1

kubectl create rolebinding cicd-token-binding \
  --clusterrole=deployment-clusterrole \
  --serviceaccount=app-team1:cicd-token \
  -n app-team1
```

### Why this works
A `ClusterRole` is cluster-scoped as an object, but it only grants permissions where it is *bound*. Binding it with a `RoleBinding` (not a `ClusterRoleBinding`) in the `app-team1` namespace restricts the effective permissions to that namespace only - this is the standard pattern for reusing a single ClusterRole across many namespaces without granting cluster-wide access. Verify with:

```bash
kubectl auth can-i create deployments -n app-team1 --as=system:serviceaccount:app-team1:cicd-token   # yes
kubectl auth can-i create deployments -n default   --as=system:serviceaccount:app-team1:cicd-token   # no
```

## Question 2: Node Maintenance (Cordon + Drain)

### Solution
```bash
NODE=$(kubectl get nodes -l drain-target=true -o jsonpath='{.items[0].metadata.name}')
kubectl cordon "$NODE"
kubectl drain "$NODE" --ignore-daemonsets --delete-emptydir-data --force
```

### Why this works
`kubectl cordon` sets `spec.unschedulable: true` on the node so the scheduler stops placing new pods there, without touching existing pods. `kubectl drain` additionally evicts existing non-DaemonSet pods so their owning controllers (in this case the `drain-target` Deployment) recreate them on other schedulable nodes. `--ignore-daemonsets` is required because DaemonSet pods cannot be evicted, and `--delete-emptydir-data` is required if any pod uses `emptyDir` volumes.

## Question 3: etcd Backup and Restore

### Solution
```bash
ETCDCTL_API=3 etcdctl snapshot save /tmp/exam/etcd-snapshot.db \
  --endpoints=https://k8s-control-plane:2379 \
  --cacert=/root/.ckdry/etcd/k8s/ca.crt \
  --cert=/root/.ckdry/etcd/k8s/client.crt \
  --key=/root/.ckdry/etcd/k8s/client.key

ETCDCTL_API=3 etcdctl snapshot status /tmp/exam/etcd-snapshot.db --write-out=table

ETCDCTL_API=3 etcdctl snapshot restore /tmp/exam/etcd-snapshot.db \
  --data-dir=/tmp/exam/etcd-restored
```

### Environment-specific adaptation
On the real CKA exam you run these commands **on the control-plane node itself** (`ssh k8s-control-plane` here), with etcd listening on `https://127.0.0.1:2379` and certs under `/etc/kubernetes/pki/etcd/`. That works in this simulator too. For convenience the jumphost can also reach etcd at `k8s-control-plane:2379`, with a client cert in `/root/.ckdry/etcd/k8s/`; the commands above use that.

Also note: verification in this lab only checks that `etcdctl snapshot restore` produced a **structurally valid** etcd data directory (i.e. it contains a `member/snap` subdirectory). To practise the full restore, ssh to `k8s-control-plane` and point `/etc/kubernetes/manifests/etcd.yaml` at the restored data directory.

## Question 4: NetworkPolicy Restricting Cross-Namespace Access

### Solution
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-from-namespace
  namespace: fubar
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: internal
      ports:
        - protocol: TCP
          port: 9000
```

### Why this works
An empty `podSelector: {}` selects every pod in the `fubar` namespace, so the policy applies namespace-wide. The single `ingress` rule combines a `namespaceSelector` (restricting the source to pods in `internal`) with a `ports` restriction (only `9000/tcp`) - both conditions inside the same rule entry must match, so this is strictly "from internal, to port 9000" and nothing else. Every namespace automatically carries the immutable label `kubernetes.io/metadata.name` equal to its own name (since Kubernetes 1.21+), so there's no need to manually label the `internal` namespace.

## Question 5: Named Container Port and NodePort Service

### Solution
```bash
kubectl patch deployment front-end -n default --type='json' -p='[
  {"op": "add", "path": "/spec/template/spec/containers/0/ports", "value": [{"name": "http", "containerPort": 80, "protocol": "TCP"}]}
]'

kubectl expose deployment front-end -n default \
  --name=front-end-svc \
  --type=NodePort \
  --port=80 \
  --target-port=http
```

Equivalent Service manifest:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: front-end-svc
  namespace: default
spec:
  type: NodePort
  selector:
    app: front-end
  ports:
    - port: 80
      targetPort: http
```

### Why this works
Naming a container port lets Services reference it symbolically via `targetPort: http` instead of a hard-coded number, which is more resilient to container spec changes. `type: NodePort` additionally opens a high port (30000-32767 by default) on every node, on top of the normal ClusterIP.

## Question 6: Scaling a Deployment

### Solution
```bash
kubectl scale deployment presentation -n default --replicas=3
```

### Why this works
`kubectl scale` patches `spec.replicas` directly; the Deployment controller then reconciles the actual replica count to match, creating 2 additional pods.

## Question 7: Scheduling with nodeSelector

### Solution
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-kusc00401
  namespace: scheduling
spec:
  nodeSelector:
    disk: ssd
  containers:
    - name: nginx
      image: nginx
```

### Why this works
`nodeSelector` is the simplest scheduling constraint - the scheduler will only place the pod on nodes whose labels are a superset of the selector, so `disk: ssd` restricts placement to the one worker node with that label.

## Question 8: Counting Ready, Schedulable Nodes

### Solution
```bash
kubectl get nodes -o json | jq '[
  .items[]
  | select((.status.conditions[] | select(.type=="Ready") | .status) == "True")
  | select(((.spec.taints // []) | map(select(.effect=="NoSchedule")) | length) == 0)
] | length' > /tmp/exam/ready-node-count.txt
```

### Why this works
A node can be `Ready` but still excluded from receiving new workloads if it carries a `NoSchedule` taint (e.g. during maintenance) - this filters for both conditions simultaneously.

## Question 9: Multi-Container Pod

### Solution
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: kucc8
  namespace: multi-container
spec:
  containers:
    - name: nginx
      image: nginx
    - name: consul
      image: hashicorp/consul:1.15
```

### Why this works
Multiple containers in the same Pod share the same network namespace and can share volumes; here they're just independent processes with no explicit inter-dependency, which is enough to satisfy the task. A specific image tag (`1.15`, not `latest`) is used for the `consul` container so the pull is deterministic and reproducible.

## Question 10: PersistentVolume with hostPath

### Solution
```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: app-data
spec:
  capacity:
    storage: 2Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /srv/app-data
```

### Why this works
A `hostPath` PV binds directly to a path on whichever node the PV ends up mounted on - suitable for single-node or test scenarios (like this simulator's kind cluster) but not for production multi-node clusters, since the data is not available if a pod is rescheduled to a different node.

## Question 11: Extracting Matching Log Lines

### Solution
```bash
kubectl logs foo -n logging | grep "error file-not-found" > /tmp/exam/foo-errors.log
```

### Why this works
`kubectl logs` streams the container's stdout; piping through `grep` with a literal (non-regex-sensitive) match extracts exactly the lines containing that string, with no false positives from other log lines.

## Question 12: Adding a Sidecar Container to Tail Logs

### Solution
```bash
kubectl get pod big-corp-app -n logging -o yaml > /tmp/exam/big-corp-app.yaml
# edit /tmp/exam/big-corp-app.yaml to add the sidecar container below, then:
kubectl delete pod big-corp-app -n logging
kubectl apply -f /tmp/exam/big-corp-app.yaml
```

Sidecar container to add:
```yaml
- name: sidecar
  image: busybox
  command: ["/bin/sh", "-c", "tail -f /var/log/big-corp-app.log"]
  volumeMounts:
    - name: varlog
      mountPath: /var/log
```

### Why this works
Kubernetes does not allow adding/removing containers on a running Pod (`spec.containers` is immutable), so the only way to add a sidecar to an existing Pod is to delete and recreate it with the updated spec. Mounting the same `emptyDir` volume (`varlog`) into both containers lets the new `sidecar` container tail the exact file the original `count` container is writing to.

## Question 13: Finding the Top CPU Consumer via Metrics

### Solution
```bash
kubectl top pod -n monitoring -l name=overloaded-cpu --no-headers \
  | sort -k2 -h -r | head -1 | awk '{print $1}' > /tmp/exam/top-cpu-pod.txt
```

### Why this works
`kubectl top pod` reads live usage data from `metrics-server` (installed in the setup step, same as `cka/002`'s HPA question). Sorting by the CPU column (`sort -k2 -h -r` handles the `m`/no-suffix millicore notation reasonably) and taking the first row identifies the highest consumer. Metrics can take 30-60 seconds to populate after pods start, so allow a short retry window if the command initially returns nothing.

## Question 14: StorageClass, PVC and Volume Expansion

### Solution
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: csi-hostpath-sc
provisioner: rancher.io/local-path
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pv-volume
  namespace: storage-pvc
spec:
  storageClassName: csi-hostpath-sc
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Mi
---
apiVersion: v1
kind: Pod
metadata:
  name: web-server
  namespace: storage-pvc
spec:
  containers:
    - name: nginx
      image: nginx
      volumeMounts:
        - name: data
          mountPath: /usr/share/nginx/html
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: pv-volume
```

Expand the PVC:
```bash
kubectl patch pvc pv-volume -n storage-pvc \
  -p '{"spec":{"resources":{"requests":{"storage":"70Mi"}}}}'
```

### Environment-specific adaptation
The real CKA exam curriculum references the `csi-hostpath-driver` for this style of question. This simulator has no CSI driver pre-installed cluster-wide (by design - see `docs/how-to-add-new-labs.md` conventions), so this lab uses kind's built-in `rancher.io/local-path` provisioner instead, which supports the same dynamic-provisioning and `allowVolumeExpansion` mechanics needed to complete the task. Also note `rancher.io/local-path` does not actually perform live filesystem expansion the way some CSI drivers do - verification here (matching the real exam's own grading behavior) only checks that the PVC's **declared/requested** size was patched to `70Mi`, not that the underlying hostPath filesystem was physically grown.

`volumeBindingMode: WaitForFirstConsumer` is required on the StorageClass - unlike some CSI drivers, `rancher.io/local-path` needs to know which node the consuming Pod lands on before it can create the volume, and errors with "no node was specified" (leaving the PVC stuck `Pending` forever) under the default `Immediate` binding mode. This is a real, confirmed requirement of this environment, not just a style preference.

## Question 15: Ingress Routing to a ClusterIP Service

### Solution
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pong
  namespace: ing-internal
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /hello
            pathType: Prefix
            backend:
              service:
                name: hello
                port:
                  number: 5678
```

### Why this works
`ingressClassName: nginx` tells the ingress-nginx controller (installed cluster-wide by this lab's setup, mirroring how `cka/002` installs Gateway API CRDs and `metrics-server` per-lab rather than baking them into the base image) that it is responsible for reconciling this Ingress object. The single rule routes any request whose path starts with `/hello` (`pathType: Prefix`) to the `hello` Service on port `5678`, which fronts the pre-existing `hello` Deployment.

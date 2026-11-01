---
name: add-question
description: Add or fix exam questions in a ckpro pack (packs/<pack>/questions/*.yaml) so they pass `ckpro lab lint` and `ckpro lab verify` on real clusters. Use for "add a question about X", "write a CKA/CKAD/CKS task", "turn this task into a question", "add it to an exam", or when a question fails verify.
---

# Add a question to a ckpro pack

A question is one YAML file. It is done only when `ckpro lab verify` proves
it on a real cluster: every check **fails** before the solution and
**passes** after it.

## 1. Place it

- Read `packs/core/pack.yaml` for the certifications and their domain names.
  Domains differ per certification (`cka: troubleshooting`,
  `ckad: application-deployment`, ...).
- Create `packs/core/questions/<cert>/<slug>.yaml`, slug in kebab-case.
  Its id is `core/<cert>/<slug>`.
- First line: `# yaml-language-server: $schema=../../../schema/question.schema.json`
- Model it on `packs/core/questions/cka/rbac-ci-token.yaml` (vars, declarative
  checks) or `cka/static-pod-on-node.yaml` (work on a node).

## 2. Write it

| Field | Notes |
|---|---|
| `title`, `statement` | The task as the real exam words it, in Markdown. Name every resource, namespace and image exactly. |
| `certifications` | `{ cka: <domain>, ckad: <domain> }`. Each must be a domain of that certification. |
| `difficulty`, `estimate` | `easy`/`medium`/`hard`, e.g. `6m`. |
| `workers` | Worker nodes needed (default 1, max 9). |
| `namespace` | Shown to the candidate. |
| `vars` | `ns: { pick: [a, b, c] }`, used as `{{ns}}`, picked per attempt so answers can't be memorised. Verify always uses the **first** value, so every value must work. |
| `setup` | Runs on the jumphost before the exam starts. For inline manifests, use `kubectl apply -f - <<'EOF'` ... `EOF`; YAML strips the block's indentation. |
| `checks` | Graded steps, with `weight` as each one's share of the points (default 1). |
| `hints` | Practice mode only. Exam mode shows none, like the real exam. |
| `solution.explain`, `solution.run` | `run` must solve it unattended. |
| `references` | kubernetes.io docs allowed in the exam. |
| `requires: [container-runtime]` | Only for tasks that build or run images locally. Such questions are skipped until that capability ships. |

Built-in placeholders: `{{cluster}}`, `{{control_plane}}`, `{{worker1}}` to
`{{worker9}}` (node names), and `{{etcd_certs}}` (a directory with `ca.crt`,
`client.crt` and `client.key`). Never hard-code node names; they differ
between the app and verify runs. A var must not reuse a built-in's name.

### Checks

Prefer the declarative kinds, because they tell the candidate what was
expected:

```yaml
- name: Deployment web runs 3 replicas
  jsonpath: { resource: deployment/web, namespace: "{{ns}}", path: "{.spec.replicas}", equals: "3" }
  # or contains: / matches: (regex)
- name: ServiceAccount ci exists
  exists: { resource: serviceaccount/ci, namespace: "{{ns}}" }   # absent: true for deletions
- name: Deployment web has all replicas updated and available
  ready: { resource: deployment/web, namespace: "{{ns}}" }   # pod: Ready; deployment/statefulset/daemonset: rollout complete
- name: ci can create deployments
  canI: { as: "system:serviceaccount:{{ns}}:ci", verb: create, resource: deployments, namespace: "{{ns}}" }  # expect: false for "must not"
- name: Anything else
  run: |
    kubectl get ... -o json | jq -e '...'   # exit 0 passes; the last line of output is the failure reason
```

## 3. Rules that verify enforces

Each rule here comes from a question that failed verify.

- **Checks are point-in-time and read-only.** No `sleep`, no polling loops
  (lint rejects `sleep`), and nothing that creates or changes resources. Checks
  run concurrently. Grading happens minutes after the candidate's last
  command, so verify re-runs failing checks for up to 60s after the solution:
  pods starting and rollouts finishing need no wait in `solution.run`.
- **Every check must fail before the solution.** Don't check what `setup`
  creates, such as "namespace exists". Combine "X works here" with "and not
  there" in one `run` check, so an empty cluster cannot pass the negative half.
- **Scripts run unattended** (`timeout 300 bash -c`, `EDITOR=false`). Lint
  rejects these, so don't use them:
  - `kubectl edit`
  - `-it`
  - `vi`, `nano` or `less`
  - `<placeholder-values>`

  Script edits instead: `kubectl get -o json | jq '...' | kubectl replace --force -f -`,
  or `kubectl patch`.
- **Wait for what you just created** before the solution *uses* it in a later command:
  - `kubectl wait --for=condition=Ready pod/x --timeout=120s` before `kubectl exec`.
  - `--for=condition=complete job/x` for Jobs.
  - `--for=jsonpath='{.status.phase}'=Bound pvc/x` before resizing a claim.
- **Setup is idempotent:**
  - `kubectl create ns X --dry-run=client -o yaml | kubectl apply -f -`
  - `--ignore-not-found`
  - `helm uninstall X --ignore-not-found` before `helm install`
  - `rm -rf` the files it writes
- **Questions in one exam share a cluster.** Use your own namespace. Taint
  or label nodes narrowly: a pod with `tolerations: [{operator: Exists}]` also
  ignores a cordon.
- **Nodes:** `ssh {{worker1}} '...'` from the jumphost, e.g. writing
  `/etc/kubernetes/manifests/` for static pods.
- **etcd 3.6:** `etcdctl snapshot save` (with `--endpoints=https://{{control_plane}}:2379`
  and the `{{etcd_certs}}` certs). `snapshot status` and `restore` are
  `etcdutl`, which works on files and takes no TLS flags.
- **Helm:** a chart repository needs an http(s) URL; `helm repo add` of a
  local directory fails.
- Show only one way to solve it in `solution.run`. A second, "or with YAML"
  version runs too and conflicts with the first.

## 4. Prove it

Run from the repo root. `ckpro` is `desktop/src-tauri/target/debug/ckpro`
(build it once with `cargo build` in `desktop/src-tauri`) or the installed
app's `ckpro.app/Contents/MacOS/ckpro`. Verify logs cluster creation to
stderr; `2>/tmp/verify.log` keeps the report on stdout readable.

```sh
ckpro lab lint packs/core                              # schema, domains, vars, interactive commands
ckpro lab verify packs/core --question core/<cert>/<slug>
ckpro lab verify packs/core --question ... --keep      # keep the cluster to debug
```

Verify builds its own kind cluster (about 2 GB, 1–3 minutes) and never
touches the app's clusters. On failure:

1. Read the reason: "passes before the solution", "solution failed (exit N)"
   or "fails after the solution".
2. Fix the question.
3. Run it again.

With `--keep`, inspect the cluster with
`docker exec ckpro-jumphost-<run> kubectl ...`. When done, delete
`~/Library/Application Support/dev.ckpro.app/runs/<run>/keep`; the next
verify removes the run (its cluster, node volumes and jumphost). Verify also
cleans up after runs that were killed or crashed. Never remove kind nodes
with a bare `docker rm -f`, which leaves a ~1 GB volume per node behind.

## 5. Put it in an exam (optional)

Exams live in `packs/core/exams/<id>.yaml` and list question ids under
`questions:`. They can also draw at random by domain:
`random: { count: 5 }`. After adding it, verify the whole exam, because its
questions share a cluster: `ckpro lab verify packs/core --exam <id>`.
`ckpro lab verify packs/core` with no selector verifies the whole pack, 4
runs at a time (`--parallel N` to change).

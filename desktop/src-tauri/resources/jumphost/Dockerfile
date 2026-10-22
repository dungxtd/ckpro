# The candidate's machine, like the exam's base host: kubectl with every
# exam cluster as a context, ssh to every node by name, etcdctl and helm.
# Built once by ckdry (runtime/infra.rs); per-exam files are mounted at
# /root/.ckdry by the app.
FROM debian:trixie-slim

ARG KUBECTL_VERSION
ARG ETCD_VERSION
ARG HELM_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash-completion ca-certificates curl jq less nano openssh-client vim \
 && rm -rf /var/lib/apt/lists/*

RUN arch=$(dpkg --print-architecture) \
 && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${arch}/kubectl" \
 && chmod +x /usr/local/bin/kubectl \
 && curl -fsSL "https://github.com/etcd-io/etcd/releases/download/${ETCD_VERSION}/etcd-${ETCD_VERSION}-linux-${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin --strip-components=1 "etcd-${ETCD_VERSION}-linux-${arch}/etcdctl" "etcd-${ETCD_VERSION}-linux-${arch}/etcdutl" \
 && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin --strip-components=1 "linux-${arch}/helm"

# kubeconfig and etcd certs come from the app (read-only mount)
RUN mkdir -p /root/.kube /root/.ssh \
 && ln -s /root/.ckdry/kubeconfig /root/.kube/config \
 && printf '%s\n' 'Host *' '  User root' '  StrictHostKeyChecking no' \
      '  UserKnownHostsFile /dev/null' '  LogLevel ERROR' > /root/.ssh/config \
 && printf '%s\n' \
      'source /usr/share/bash-completion/bash_completion' \
      'source <(kubectl completion bash)' \
      'alias k=kubectl' \
      'complete -o default -F __start_kubectl k' \
      'source <(helm completion bash)' \
      >> /root/.bashrc

WORKDIR /root
CMD ["sleep", "infinity"]

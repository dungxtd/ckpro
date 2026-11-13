# The task host: where the candidate solves tasks and checks grade them.
# Reached from the exam desktop (`base`) with `ssh <host>`, one host name per
# cluster, which logs in with that cluster's kubectl context. kubectl (k,
# completion), helm, etcdctl, yq, curl, wget and man, like the exam's hosts;
# ssh to every node by name. Built by ckpro (runtime/infra.rs); per-exam
# files are mounted at /root/.ckpro by the app.
FROM debian:trixie-slim

ARG KUBECTL_VERSION
ARG ETCD_VERSION
ARG HELM_VERSION
ARG YQ_VERSION

# Man pages too: the slim image leaves them out, also for the tools it ships
# (coreutils, grep...), which are reinstalled to get theirs
RUN rm -f /etc/dpkg/dpkg.cfg.d/docker \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      bash-completion ca-certificates curl wget jq less man-db manpages nano \
      openssh-client openssh-server vim \
 && apt-get install -y --reinstall --no-install-recommends \
      bash coreutils findutils grep gzip sed tar util-linux \
 && rm -rf /var/lib/apt/lists/*

RUN arch=$(dpkg --print-architecture) \
 && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${arch}/kubectl" \
 && chmod +x /usr/local/bin/kubectl \
 && curl -fsSL "https://github.com/etcd-io/etcd/releases/download/${ETCD_VERSION}/etcd-${ETCD_VERSION}-linux-${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin --strip-components=1 "etcd-${ETCD_VERSION}-linux-${arch}/etcdctl" "etcd-${ETCD_VERSION}-linux-${arch}/etcdutl" \
 && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin --strip-components=1 "linux-${arch}/helm" \
 && curl -fsSLo /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${arch}" \
 && chmod +x /usr/local/bin/yq

# kubeconfig and etcd certs come from the app (read-only mount)
RUN mkdir -p /root/.kube /root/.ssh \
 && ln -s /root/.ckpro/kubeconfig /root/.kube/config \
 && printf '%s\n' 'Host *' '  User root' '  StrictHostKeyChecking no' \
      '  UserKnownHostsFile /dev/null' '  LogLevel ERROR' > /root/.ssh/config \
 && printf '%s\n' \
      'source /usr/share/bash-completion/bash_completion' \
      'source <(kubectl completion bash)' \
      'alias k=kubectl' \
      'complete -o default -F __start_kubectl k' \
      'source <(helm completion bash)' \
      >> /root/.bashrc

# sshd for the exam desktop, on the private exam network only. The desktop
# sends CKPRO_HOST (the host name it used): login switches to that cluster
# and shows it in the prompt
RUN usermod -p '*' root \
 && mkdir -p /run/sshd \
 && printf '%s\n' 'PermitRootLogin prohibit-password' 'PasswordAuthentication no' \
      'KbdInteractiveAuthentication no' 'UsePAM no' 'AcceptEnv CKPRO_HOST' \
      > /etc/ssh/sshd_config.d/ckpro.conf \
 && printf '%s\n' \
      'if [ -n "$CKPRO_HOST" ]; then' \
      '  kubectl config use-context "$CKPRO_HOST" >/dev/null 2>&1' \
      '  PS1="\u@$CKPRO_HOST:\w\\$ "' \
      'fi' \
      >> /root/.bashrc

WORKDIR /root
CMD ["/usr/sbin/sshd", "-D", "-e"]

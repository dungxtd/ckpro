# The assistant's runtime: the Claude ACP adapter (with the Claude CLI it
# bundles) on Node, so the host needs neither. The app runs it with stdio
# attached (one container per connection) and keeps the Claude login in the
# ckdry-claude volume. NO_BROWSER: the login prints its link and takes the
# browser's code back, as there is no browser in here.
FROM node:22-slim

ARG ADAPTER_VERSION
RUN npm install -g "@agentclientprotocol/claude-agent-acp@${ADAPTER_VERSION}" \
 && npm cache clean --force

USER node
RUN mkdir -p /home/node/.claude /home/node/work
ENV CLAUDE_CONFIG_DIR=/home/node/.claude NO_BROWSER=1
WORKDIR /home/node/work
ENTRYPOINT ["claude-agent-acp"]

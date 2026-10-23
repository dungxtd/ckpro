# The exam's remote desktop: the machine named `base`, an XFCE desktop with a
# terminal, Firefox and a virtual keyboard, and no Kubernetes tools. Each task
# names the host to `ssh` into, as on the real exam. Served over VNC through
# websockify; the app is the noVNC client. Built once by ckdry
# (runtime/infra.rs); started for an exam attempt (runtime/desktop.rs).
FROM debian:trixie-slim

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates dbus-x11 xauth x11-xserver-utils \
      tigervnc-standalone-server tigervnc-tools websockify \
      xfce4-session xfwm4 xfce4-panel xfdesktop4 xfce4-settings xfce4-terminal xfconf \
      adwaita-icon-theme elementary-xfce-icon-theme fonts-dejavu-core fonts-liberation \
      firefox-esr onboard openssh-client vim nano less \
 && rm -rf /var/lib/apt/lists/*

# The candidate: no sudo, no tools; `ssh <host>` reaches the task hosts and
# nodes as root, without host key prompts
RUN useradd -m -s /bin/bash candidate \
 && printf '%s\n' 'Host *' '  User root' '  StrictHostKeyChecking no' \
      '  UserKnownHostsFile /dev/null' '  LogLevel ERROR' > /etc/ssh/ssh_config.d/00-exam.conf \
 && mkdir -p /etc/firefox/policies /etc/firefox-esr/policies /home/candidate/.vnc \
      /home/candidate/.config/xfce4/xfconf/xfce-perchannel-xml /home/candidate/.config/xfce4/panel

COPY start.sh /usr/local/bin/start-desktop
COPY xfce4-panel.xml /home/candidate/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml
COPY helpers.rc /home/candidate/.config/xfce4/helpers.rc
COPY terminal.desktop /home/candidate/.config/xfce4/panel/launcher-9/terminal.desktop
COPY firefox.desktop /home/candidate/.config/xfce4/panel/launcher-10/firefox.desktop
COPY keyboard.desktop /home/candidate/.config/xfce4/panel/launcher-8/keyboard.desktop
RUN chmod +x /usr/local/bin/start-desktop \
 && chown -R candidate:candidate /home/candidate

USER candidate
WORKDIR /home/candidate
ENV HOME=/home/candidate USER=candidate
EXPOSE 6080
CMD ["/usr/local/bin/start-desktop"]

# The exam's remote desktop: the machine named `base`, an XFCE desktop with a
# terminal, Firefox, VSCodium and a virtual keyboard, and no Kubernetes tools. Each task
# names the host to `ssh` into, as on the real exam. Served over VNC through
# websockify; the app is the noVNC client. Built once by cktry
# (runtime/infra.rs); started for an exam attempt (runtime/desktop.rs).
FROM debian:trixie-slim

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates dbus-x11 xauth x11-xserver-utils \
      tigervnc-standalone-server tigervnc-tools websockify \
      xfce4-session xfwm4 xfce4-panel xfdesktop4 xfce4-settings xfce4-terminal xfconf \
      adwaita-icon-theme elementary-xfce-icon-theme fonts-dejavu-core fonts-liberation \
      firefox-esr onboard openssh-client vim nano less gvfs libglib2.0-bin thunar \
      greybird-gtk-theme xfce4-appfinder \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/share/icons/elementary-xfce-hidpi

# VSCodium, like the exam's: no marketplace, so no extensions can be
# installed; English only and without the Mermaid diagram previews (~90 MB).
# Electron runs without its sandbox inside the container
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl gnupg jq \
 && curl -fsSL https://gitlab.com/paulcarroty/vscodium-deb-rpm-repo/raw/master/pub.gpg \
      | gpg --dearmor -o /usr/share/keyrings/vscodium-archive-keyring.gpg \
 && printf '%s\n' 'Types: deb' 'URIs: https://download.vscodium.com/debs' 'Suites: vscodium' \
      'Components: main' 'Signed-By: /usr/share/keyrings/vscodium-archive-keyring.gpg' \
      > /etc/apt/sources.list.d/vscodium.sources \
 && apt-get update \
 && apt-get install -y --no-install-recommends codium \
 && product=/usr/share/codium/resources/app/product.json \
 && jq 'del(.extensionsGallery)' "$product" > /tmp/product.json && mv /tmp/product.json "$product" \
 && find /usr/share/codium/locales -name '*.pak' ! -name 'en-US.pak' -delete \
 && rm -rf /usr/share/codium/resources/app/extensions/mermaid-markdown-features \
 && apt-get purge -y curl gnupg jq && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# The candidate: no sudo, no tools; `ssh <host>` reaches the task hosts and
# nodes as root, without host key prompts
RUN useradd -m -s /bin/bash -c "Exam Candidate" candidate \
 && printf '%s\n' 'Host *' '  User root' '  StrictHostKeyChecking no' \
      '  UserKnownHostsFile /dev/null' '  LogLevel ERROR' > /etc/ssh/ssh_config.d/00-exam.conf \
 && mkdir -p /etc/firefox/policies /etc/firefox-esr/policies /home/candidate/.vnc \
      /home/candidate/.config/xfce4/xfconf/xfce-perchannel-xml /home/candidate/Desktop

COPY start.sh /usr/local/bin/start-desktop
COPY trust-launchers.sh /usr/local/bin/trust-launchers
COPY xsettings.xml xfce4-desktop.xml xfce4-terminal.xml xfwm4.xml /home/candidate/.config/xfce4/xfconf/xfce-perchannel-xml/
COPY vscodium-settings.json /home/candidate/.config/VSCodium/User/settings.json
COPY xfce-stripes.png /usr/share/backgrounds/xfce/xfce-stripes.png
COPY helpers.rc /home/candidate/.config/xfce4/helpers.rc
COPY firefox-esr-helper.desktop /home/candidate/.local/share/xfce4/helpers/firefox-esr.desktop
COPY gtk.css /home/candidate/.config/gtk-3.0/gtk.css
# The exam's desktop icons (xfdesktop opens them through Thunar's service)
COPY terminal.desktop firefox.desktop codium.desktop keyboard.desktop /home/candidate/Desktop/
# Xfce's own default panels, as on the exam: the dark top bar (menu, windows,
# clock with the date, the user) and the dock (show desktop, terminal, files,
# browser, app finder, folders). Copied, not migrated, so no first-run dialog
RUN conf=/home/candidate/.config/xfce4 \
 && cp /etc/xdg/xfce4/panel/default.xml $conf/xfconf/xfce-perchannel-xml/xfce4-panel.xml \
 && sed -i 's|<property name="plugin-8" type="string" value="clock"/>|<property name="plugin-8" type="string" value="clock"><property name="digital-layout" type="uint" value="3"/><property name="digital-time-format" type="string" value="%a %d %b, %H:%M"/></property>|' \
      $conf/xfconf/xfce-perchannel-xml/xfce4-panel.xml \
 && for launcher in 13:xfce4-terminal-emulator 14:xfce4-file-manager 15:xfce4-web-browser 16:xfce4-appfinder; do \
      mkdir -p $conf/panel/launcher-${launcher%%:*} \
      && cp /usr/share/applications/${launcher#*:}.desktop $conf/panel/launcher-${launcher%%:*}/; \
    done

# No way to log out or shut down from the desktop (it would leave a black
# screen): the user button lists no session actions, the menu no Log Out
RUN conf=/home/candidate/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml \
 && sed -i 's|<property name="plugin-10" type="string" value="actions"/>|<property name="plugin-10" type="string" value="actions"><property name="items" type="array"><value type="string" value="-lock-screen"/><value type="string" value="-switch-user"/><value type="string" value="-separator"/><value type="string" value="-suspend"/><value type="string" value="-hibernate"/><value type="string" value="-hybrid-sleep"/><value type="string" value="-separator"/><value type="string" value="-shutdown"/><value type="string" value="-restart"/><value type="string" value="-separator"/><value type="string" value="-logout"/><value type="string" value="-logout-dialog"/></property></property>|' $conf \
 && grep -q 'value="-logout-dialog"' $conf \
 && mkdir -p /home/candidate/.local/share/applications \
 && sed '/^\[Desktop Entry\]/a NoDisplay=true' /usr/share/applications/xfce4-session-logout.desktop \
      > /home/candidate/.local/share/applications/xfce4-session-logout.desktop

RUN mkdir -m 1777 -p /tmp/.ICE-unix \
 && chmod +x /usr/local/bin/start-desktop /usr/local/bin/trust-launchers /home/candidate/Desktop/*.desktop \
 && chown -R candidate:candidate /home/candidate

USER candidate
WORKDIR /home/candidate
ENV HOME=/home/candidate USER=candidate
EXPOSE 6080
CMD ["/usr/local/bin/start-desktop"]

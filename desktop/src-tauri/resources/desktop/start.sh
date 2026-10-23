#!/bin/bash
# Xvnc (localhost only) + the XFCE session + websockify, the one port the app
# connects to. VNC_PASSWORD comes from the app, new for every attempt.
set -e
printf '%s\n' "${VNC_PASSWORD:?}" | vncpasswd -f > "$HOME/.vnc/passwd"
chmod 600 "$HOME/.vnc/passwd"

Xvnc :1 -geometry "${VNC_GEOMETRY:-1280x800}" -depth 24 -rfbport 5901 -localhost=1 \
  -SecurityTypes VncAuth -PasswordFile "$HOME/.vnc/passwd" -AlwaysShared -desktop base &
export DISPLAY=:1
for _ in $(seq 50); do [ -S /tmp/.X11-unix/X1 ] && break; sleep 0.1; done

# The session bus first, so the desktop icons are marked trusted before
# xfdesktop shows them
dbus-launch --exit-with-session sh -c 'trust-launchers; exec startxfce4' >/tmp/xfce.log 2>&1 &
exec websockify 6080 localhost:5901

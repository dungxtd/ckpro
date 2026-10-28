#!/bin/bash
# Xvnc (localhost only) + the XFCE session + websockify, the one port the app
# connects to. VNC_PASSWORD comes from the app, new for every attempt.
set -e
printf '%s\n' "${VNC_PASSWORD:?}" | vncpasswd -f > "$HOME/.vnc/passwd"
chmod 600 "$HOME/.vnc/passwd"

# A restarted container (the app reopened, Reset desktop) keeps the last
# run's lock and socket: Xvnc would refuse display :1 ("Server is already
# active") while websockify kept the container looking up
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1

Xvnc :1 -geometry "${VNC_GEOMETRY:-1280x800}" -depth 24 -rfbport 5901 -localhost=1 \
  -SecurityTypes VncAuth -PasswordFile "$HOME/.vnc/passwd" -AlwaysShared -desktop base &
export DISPLAY=:1
for _ in $(seq 50); do [ -S /tmp/.X11-unix/X1 ] && break; sleep 0.1; done
[ -S /tmp/.X11-unix/X1 ] || { echo "Xvnc did not start" >&2; exit 1; }

# The session bus first, so the desktop icons are marked trusted before
# xfdesktop shows them (and so this script can see the session come up)
eval "$(dbus-launch --sh-syntax)"
trust-launchers
# Logging out (there is no menu item for it, but a terminal can) or a crash
# ends the session: start it again, as Reset desktop would, rather than leave
# the candidate a black screen
(while :; do
  startxfce4 >>/tmp/xfce.log 2>&1
  echo "the session ended: starting it again" >>/tmp/xfce.log
  sleep 1
done) &

# The app connects, and sets the desktop to its size, only once the panel and
# the desktop are up: resized while they start, they stay laid out for the old
# size, in the top-left corner (Reset desktop on a busy machine). Their D-Bus
# names say they run; a moment more for them to settle
session_up() {
  names=$(dbus-send --session --print-reply --dest=org.freedesktop.DBus \
    /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null) || return 1
  case $names in *'"org.xfce.Panel"'*) ;; *) return 1 ;; esac
  case $names in *'"org.xfce.xfdesktop"'*) ;; *) return 1 ;; esac
}
for _ in $(seq 300); do session_up && break; sleep 0.1; done
sleep 1
exec websockify 6080 localhost:5901

#!/bin/sh
# xfdesktop runs a launcher on the desktop only when it is trusted:
# executable, with its checksum in GIO metadata. Run at session start.
for f in "$HOME"/Desktop/*.desktop; do
  gio set -t string "$f" metadata::xfce-exe-checksum "$(sha256sum "$f" | cut -d' ' -f1)"
done

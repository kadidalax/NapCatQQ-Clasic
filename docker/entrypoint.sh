#!/bin/sh
# License: see repository LICENSE (NapCat Limited Redistribution License).
# Maintainer: kadidalax.
set -eu
umask 077
node /usr/local/lib/napcatqq-clasic/init-config.mjs
# Run the existing repository loader under QQ's own Electron/native ABI.
# Xvfb avoids a host display or privileged container; tini reaps child processes.
exec xvfb-run -a --server-args="-screen 0 1280x720x24 -nolisten tcp" \
  /opt/QQ/qq --no-sandbox --disable-gpu "$@"

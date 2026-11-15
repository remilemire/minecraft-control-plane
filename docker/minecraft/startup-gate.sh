#!/bin/sh
set -eu
trap 'exit 0' TERM INT
hostname=$(cat /etc/hostname)
nonce=$(cat /proc/sys/kernel/random/uuid)
request=$(printf '%s\n%s' "$hostname" "$nonce")
temporary="/startup-requests/request-$nonce.tmp"
umask 022
printf '%s\n' "$request" > "$temporary"
mv "$temporary" /startup-requests/current
echo 'Minecraft is waiting for controller startup authorization.'
while :; do
  if [ -r /startup-permits/current ] && [ "$(cat /startup-permits/current)" = "$request" ]; then
    echo 'Controller authorized this Minecraft boot.'
    exec /image/scripts/start "$@"
  fi
  sleep 1 &
  wait $! || true
done

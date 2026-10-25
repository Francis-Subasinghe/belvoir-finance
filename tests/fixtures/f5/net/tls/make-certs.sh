#!/bin/sh
# F5-28 TLS fixtures (N-26, N-27), generated into $1 at test time so no private
# key is committed: a test CA, a certificate for the right host and one for the
# wrong host (both signed by the CA), and a self-signed one for the right host.
set -eu
d="$1"
cd "$d"
q() { openssl "$@" >/dev/null 2>&1; }
q req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 2 -subj "/CN=Belvoir F5 test CA"
for name in good:feeds.fx-rss.test wrong:other.example.invalid; do
  n="${name%%:*}"; h="${name#*:}"
  q req -newkey rsa:2048 -nodes -keyout "$n.key" -out "$n.csr" -subj "/CN=$h"
  printf 'subjectAltName=DNS:%s\n' "$h" > "$n.ext"
  q x509 -req -in "$n.csr" -CA ca.crt -CAkey ca.key -CAcreateserial -out "$n.crt" -days 2 -extfile "$n.ext"
done
q req -x509 -newkey rsa:2048 -nodes -keyout self.key -out self.crt -days 2 -subj "/CN=feeds.fx-rss.test" -addext "subjectAltName=DNS:feeds.fx-rss.test"

#!/bin/sh

set -eu

if [ "$#" -ne 0 ]; then
  printf '%s\n' 'WORK_TRACKER_RELEASE_PREPARE_ERROR={"message":"release prepare does not accept arguments"}' >&2
  exit 64
fi

exec /usr/bin/env -i \
  HOME=/Users/glaucon \
  PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  TMPDIR=/private/tmp \
  LANG=C \
  LC_ALL=C \
  /usr/local/bin/node \
  /Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare-body.mjs

#!/usr/bin/env bash

set -eu

echo "You've started a documentation-service build!"

# shellcheck source=/usr/local/nvm
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
echo "Should say nvm: $(command -v nvm)"

echo "Environment:"
printenv

# Steps might include:
# 1 - clone repo based on GIT_ env vars
# 2 - use nvm to install relevant version of node.js (default to 6?)
# 3 - npm install the repo
# 4 - repo indicates how to run documentation tool? depend on specific documentation version?
# 5 - build documentation into a known location
# 6 - sync files to S3

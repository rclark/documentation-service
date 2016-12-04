#!/usr/bin/env bash

# Prerequisites: zip and awscli

set -eux

bucket=${1:-cf-templates-flbneh43iejh-us-east-1}
key=${2:-documentation-service-bundle.zip}
zipfile=${3:-$(pwd)/bundle.zip}

function removemodules() {
  for filename in node_modules/*; do
    npm uninstall "$(basename "${filename}")"
  done
}

# Reinstall node modules for linux, without devDependencies
removemodules > /dev/null
npm install --production \
  --target=4.3.2 \
  --target_platform=linux \
  --target_arch=x64 > /dev/null 2>&1

mkdir -p "build"
if [ -f "${zipfile}" ]; then
  rm "${zipfile}"
fi

# Make a zip archive
zip -r -q "${zipfile}" ./ -i index.js
zip -r -q "${zipfile}" ./node_modules

# Reinstall your platform's dependencies so you can keep working
removemodules > /dev/null 2>&1
npm install > /dev/null 2>&1

aws s3 cp "${zipfile}" "s3://${bucket}/${key}"

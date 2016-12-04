'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');
const region = process.env.AWS_DEFAULT_REGION;
const project = process.env.BUILD_PROJECT;
const secret = process.env.WEBHOOK_SECRET;
const cb = new AWS.CodeBuild({ region });

module.exports.launch = function(event, context, callback) {
  const body = event.body;
  const hash = 'sha1=' + crypto
    .createHmac('sha1', secret)
    .update(new Buffer(JSON.stringify(body)))
    .digest('hex');
  if (event.signature !== hash)
    return context.done('invalid: signature does not match');
  if (body.zen)
    return context.done(null, 'ignored ping request');
  cb.startBuild({
    projectName: project,
    environmentVariablesOverride: [
      { name: 'GIT_REF', value: event.body.ref || '' },
      { name: 'GIT_AFTER', value: event.body.after || '' },
      { name: 'GIT_BEFORE', value: event.body.before || '' },
      { name: 'GIT_DELETED', value: event.body.deleted || '' },
      { name: 'GIT_NAME', value: event.body.repository.name || '' },
      { name: 'GIT_OWNER', value: event.body.repository.owner.name || '' },
      { name: 'GIT_PUSHER', value: event.body.pusher.name || '' }
    ]
  }, callback);
};

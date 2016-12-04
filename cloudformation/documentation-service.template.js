'use strict';

const cf = require('cloudfriend');
const crypto = require('crypto');
const Resources = {};
const Outputs = {};

Resources.BuildBucket = {
  Type: 'AWS::S3::Bucket',
  DeletionPolicy: 'Retain',
  Properties: {
    BucketName: cf.sub('${AWS::StackName}-output')
  }
};

Resources.BuildRole = {
  Type: 'AWS::IAM::Role',
  Properties: {
    RoleName: cf.sub('${AWS::StackName}-build'),
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'codebuild.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }
      ]
    },
    Policies: [
      {
        PolicyName: 'write-logs',
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
              ],
              Resource: [
                cf.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/documentation-service'),
                cf.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/codebuild/documentation-service:*')
              ]
            }
          ]
        }
      },
      {
        PolicyName: 'write-output',
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                's3:PutObject',
                's3:PutObjectAcl'
              ],
              Resource: cf.sub('arn:aws:s3:::${BuildBucket}')
            }
          ]
        }
      }
    ]
  }
};

Resources.BuildProject = {
  Type: 'AWS::CodeBuild::Project',
  Properties: {
    Name: cf.stackName,
    Description: cf.sub('Documentation builder for ${AWS::StackName}'),
    Environment: {
      ComputeType: 'BUILD_GENERAL1_SMALL',
      Image: cf.sub('${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/documentation-service:latest'),
      Type: 'LINUX_CONTAINER',
      EnvironmentVariables: [
        { Name: 'BUILD_BUCKET', Value: cf.ref('BuildBucket') }
      ]
    },
    ServiceRole: cf.getAtt('BuildRole', 'Arn'),
    Artifacts: { Type: 'NO_ARTIFACTS' }
  }
};

Resources.WebhookApi = {
  Type: 'AWS::ApiGateway::RestApi',
  Properties: {
    Name: cf.sub('${AWS::StackName}-webhook'),
    FailOnWarnings: true
  }
};

Resources.WebhookResource = {
  Type: 'AWS::ApiGateway::Resource',
  Properties: {
    ParentId: cf.getAtt('WebhookApi', 'RootResourceId'),
    RestApiId: cf.ref('WebhookApi'),
    PathPart: 'build'
  }
};

Resources.WebhookSecret = {
  Type: 'AWS::ApiGateway::ApiKey',
  Properties: {
    Description: cf.sub('Secret key for ${AWS::StackName}'),
    Enabled: false,
    Name: cf.stackName
  }
};

Outputs.WebhookSecret = {
  Value: cf.ref('WebhookSecret')
};

Resources.WebhookFunctionRole = {
  Type: 'AWS::IAM::Role',
  Properties: {
    RoleName: cf.sub('${AWS::StackName}-webhook-function'),
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }
      ]
    },
    Policies: [
      {
        PolicyName: 'write-logs',
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: 'logs:*',
              Resource: 'arn:aws:logs:*'
            }
          ]
        }
      }
    ]
  }
};

Resources.WebhookFunction = {
  Type: 'AWS::Lambda::Function',
  Properties: {
    Role: cf.getAtt('WebhookFunctionRole', 'Arn'),
    Description: cf.sub('[${AWS::StackName}] Handle authorization and launch builds'),
    Handler: 'index.launch',
    Runtime: 'nodejs4.3',
    Timeout: 30,
    MemorySize: 128,
    Code: {
      ZipFile: cf.join('\n', [
        'var AWS = require("aws-sdk");',
        'var crypto = require("crypto");',
        'var cb = new AWS.CodeBuild({ region });',
        cf.sub('var region = "${AWS::Region}";'),
        cf.sub('var sns = new AWS.SNS({ region });'),
        cf.sub('var project = "${BuildProject}";'),
        cf.sub('var secret = "${WebhookSecret}";'),
        'module.exports.webhooks = function(event, context, callback) {',
        '  var body = event.body',
        '  var hash = "sha1=" + crypto.createHmac("sha1", secret).update(new Buffer(JSON.stringify(body))).digest("hex");',
        '  if (event.signature !== hash) return context.done("invalid: signature does not match");',
        '  if (body.zen) return context.done(null, "ignored ping request");',
        '  cb.startBuild({',
        '    projectName: project,',
        '    environmentVariablesOverride: [',
        '      { name: "GIT_REF", value: event.body.ref },',
        '      { name: "GIT_AFTER", value: event.body.after },',
        '      { name: "GIT_BEFORE", value: event.body.before },',
        '      { name: "GIT_DELETED", value: event.body.deleted },',
        '      { name: "GIT_NAME", value: event.body.repository.name },',
        '      { name: "GIT_OWNER", value: event.body.repository.owner.name },',
        '      { name: "GIT_PUSHER", value: event.body.pusher.name },',
        '    ]',
        '  }, callback);',
        '};'
      ])
    }
  }
};

Resources.WebhookPermission = {
  Type: 'AWS::Lambda::Permission',
  Properties: {
    FunctionName: cf.ref('WebhookFunction'),
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: cf.join(['arn:aws:execute-api:', cf.region, ':', cf.accountId, ':', cf.ref('WebhookApi'), '/*'])
  }
};

Resources.WebhookMethod = {
  Type: 'AWS::ApiGateway::Method',
  Properties: {
    RestApiId: cf.ref('WebhookApi'),
    ResourceId: cf.ref('WebhookResource'),
    ApiKeyRequired: false,
    AuthorizationType: 'None',
    HttpMethod: 'POST',
    Integration: {
      Type: 'AWS',
      IntegrationHttpMethod: 'POST',
      IntegrationResponses: [
        { StatusCode: 200 },
        { StatusCode: 500, SelectionPattern: '^error.*' },
        { StatusCode: 403, SelectionPattern: '^invalid.*' }
      ],
      Uri: cf.join(['arn:aws:apigateway:', cf.region, ':lambda:path/2015-03-31/functions/', cf.getAtt('WebhookFunction', 'Arn'), '/invocations']),
      RequestTemplates: {
        'application/json': '{"signature":"$input.params(\'X-Hub-Signature\')","body":$input.json(\'$\')}'
      }
    },
    MethodResponses: [
      { StatusCode: '200', ResponseModels: { 'application/json': 'Empty' } },
      { StatusCode: '500', ResponseModels: { 'application/json': 'Empty' } },
      { StatusCode: '403', ResponseModels: { 'application/json': 'Empty' } }
    ]
  }
};

const deploymentName = crypto.randomBytes(8).toString('hex');
Resources[deploymentName] = {
  Type: 'AWS::ApiGateway::Deployment',
  DependsOn: 'WebhookMethod',
  Properties: {
    RestApiId: cf.ref('WebhookApi'),
    StageName: 'documentation',
    StageDescription: {
      MethodSettings: [
        {
          HttpMethod: '*',
          ResourcePath: '/*',
          ThrottlingBurstLimit: 30,
          ThrottlingRateLimit: 10
        }
      ]
    }
  }
};

Outputs.WebhookEndpoint = {
  Value: cf.sub('https://${WebhookApi}.execute-api.${AWS::Region}.amazonaws.com/documentation/build')
};

module.exports = { Resources, Outputs };

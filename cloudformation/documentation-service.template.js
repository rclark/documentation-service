'use strict';

const cf = require('cloudfriend');
const crypto = require('crypto');

const Parameters = {};
const Resources = {};
const Outputs = {};

Parameters.BundleBucket = {
  Type: 'String',
  Description: 'The S3 bucket containing the lambda bundle.zip',
  Default: 'cf-templates-flbneh43iejh-us-east-1'
};

Parameters.BundleKey = {
  Type: 'String',
  Description: 'The S3 key for the lambda bundle.zip',
  Default: 'documentation-service-bundle.zip'
};

Resources.BuildEnvironmentRepository = {
  Type: 'AWS::ECR::Repository',
  Properties: {
    RepositoryName: 'documentation-service',
    RepositoryPolicyText: {
      'Version': '2012-10-17',
      Statement: {
        Effect: 'Allow',
        Action: [
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:BatchCheckLayerAvailability'
        ],
        Principal: {
          AWS: [
            'arn:aws:iam::201349592320:root',
            'arn:aws:iam::570169269855:root',
            'arn:aws:iam::964771811575:root'
          ]
        }
      }
    }
  }
};

Resources.BuildBucket = {
  Type: 'AWS::S3::Bucket',
  DeletionPolicy: 'Retain',
  Properties: {
    BucketName: cf.sub('${AWS::StackName}-output')
  }
};

Resources.BuildLogGroup = {
  Type: 'AWS::Logs::LogGroup',
  Properties: {
    LogGroupName: cf.sub('/aws/codebuild/${AWS::StackName}'),
    RetentionInDays: 14
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
                cf.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:${BuildLogGroup}'),
                cf.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:${BuildLogGroup}:*')
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
        { Name: 'NVM_DIR', Value: '/usr/local/nvm' },
        { Name: 'BUILD_BUCKET', Value: cf.ref('BuildBucket') }
      ]
    },
    ServiceRole: cf.getAtt('BuildRole', 'Arn'),
    Source: {
      Type: 'GITHUB',
      Location: cf.sub('https://github.com/rclark/documentation-service.git')
    },
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

const functionName = '${AWS::StackName}-webhook';

Resources.WebhookLogGroup = {
  Type: 'AWS::Logs::LogGroup',
  Properties: {
    LogGroupName: cf.sub(`/aws/lambda/${functionName}`),
    RetentionInDays: 7
  }
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
              Action: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
              ],
              Resource: [
                cf.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:${WebhookLogGroup}'),
                cf.sub('arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:${WebhookLogGroup}:*')
              ]
            }
          ]
        }
      },
      {
        PolicyName: 'start-build',
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'codebuild:StartBuild'
              ],
              Resource: [
                cf.getAtt('BuildProject', 'Arn')
              ]
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
    FunctionName: cf.sub(functionName),
    Role: cf.getAtt('WebhookFunctionRole', 'Arn'),
    Description: cf.sub('[${AWS::StackName}] Handle authorization and launch builds'),
    Handler: 'index.launch',
    Runtime: 'nodejs4.3',
    Timeout: 30,
    MemorySize: 128,
    Code: {
      S3Bucket: cf.ref('BundleBucket'),
      S3Key: cf.ref('BundleKey')
    },
    Environment: {
      Variables: {
        BUILD_PROJECT: cf.ref('BuildProject'),
        WEBHOOK_SECRET: cf.ref('WebhookSecret')
      }
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
    StageName: 'unused'
  }
};

Resources.WebhookStage = {
  Type: 'AWS::ApiGateway::Stage',
  Properties: {
    DeploymentId: cf.ref(deploymentName),
    StageName: 'documentation',
    RestApiId: cf.ref('WebhookApi'),
    MethodSettings: [
      {
        HttpMethod: '*',
        ResourcePath: '/*',
        ThrottlingBurstLimit: 30,
        ThrottlingRateLimit: 10
      }
    ]
  }
};

Outputs.WebhookEndpoint = {
  Value: cf.sub('https://${WebhookApi}.execute-api.${AWS::Region}.amazonaws.com/documentation/build')
};

module.exports = { Parameters, Resources, Outputs };

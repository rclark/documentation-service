# documentation-service

## Bootstrap

0. Prerequisites
  - `zip`
  - `awscli`
  - running a shell with AWS authentication

1. Bundle and upload lambda code
  - `npm run build-bundle <bucket name> <bundle key>`

2. Launch a CloudFormation stack
  - use [cfn-config](https://github.com/mapbox/cfn-config)
  - _or_ run `npm run build-template` and manually deploy the `.json` template file from the `cloudformation` directory.
  - you will need to provide the previous step's `<bucket name>` and `<bundle key>` as stack parameters

3. Build and upload the documentation-service docker image
  - `npm run build-image`

4. Setup a webhook
  - the AWS CloudFormation console
  - find stack outputs for the stack you created
  - use these outputs to enable a webhook on a GitHub repository

5. Monitor success
  - the AWS CodeBuild console will contain build logs

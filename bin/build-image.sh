#!/usr/bin/env bash

# Prerequisites: awscli

set -eux

# Log docker client into ECR
eval "$(aws ecr get-login --region us-east-1)"

# Make sure the ECR repository exists
aws ecr describe-repositories --region us-east-1 --repository-names documentation-service > /dev/null 2>&1 || \
  aws ecr create-repository --region us-east-1 --repository-name documentation-service > /dev/null

# Fetch the ECR repository URI
desc=$(aws ecr describe-repositories --region us-east-1 --repository-names documentation-service)
uri=$(node -e "console.log(${desc}.repositories[0].repositoryUri);")

# Build the docker image
docker build -t documentation-service ./

# Tag the image into the ECR repository and push it
# docker tag documentation-service "${uri}:$(git rev-parse head)"
# docker push "${uri}:$(git rev-parse head)"
docker tag documentation-service "${uri}:latest"
docker push "${uri}:latest"

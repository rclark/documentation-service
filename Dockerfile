FROM ubuntu:16.04

ENV NVM_DIR="/usr/local/nvm"

RUN apt-get update -qq && \
    apt-get -y -qq install build-essential libssl-dev curl git python-pip && \
    pip install awscli && \
    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.32.1/install.sh | bash && \
    apt-get purge -y build-essential && \
    apt-get autoremove -y

COPY ./bin/documentation-service.sh /usr/local/bin/documentation-service

WORKDIR /usr/local/src/documentation-service

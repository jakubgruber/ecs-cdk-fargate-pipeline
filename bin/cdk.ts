#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AppStack } from '../lib/app-stack';

const app = new cdk.App();

new AppStack(app, 'greeter-stack', {
    env: {
        account: app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT,
        region: app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION,
    },
});

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SanctionsInfraStack } from '../lib/sanctions-infra-stack';

const app = new cdk.App();
new SanctionsInfraStack(app, 'SanctionsInfraStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
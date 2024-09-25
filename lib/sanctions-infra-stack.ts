import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from 'node:path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import config from '../config';
import { ScheduledEc2Task } from 'aws-cdk-lib/aws-ecs-patterns';

export class SanctionsInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = {
      MEILISEARCH_API_URL: config.meiliSearchApiUrl,
      MEILISEARCH_API_KEY: config.meiliSearchApiKey,
      MEILISEARCH_INDEX: config.meiliSearchIndex,
      SEARCH_INPUT_LIMIT: config.searchInputLimit.toString(),
      SEARCH_RESULTS_LIMIT: config.searchLimit.toString(),
      SMART_SEARCH_INPUT_LIMIT: config.smartSearchInputLimit.toString(),
      SMART_SEARCH_RESULTS_LIMIT: config.smartSearchLimit.toString(),
      INDIVIDUAL_SEARCH_RANKING_THRESHOLD: config.individualSearchRankingThreshold.toString(),
      ENTITY_SEARCH_RANKING_THRESHOLD: config.entitySearchRankingThreshold.toString(),
      HIGHLIGHT_PRE_TAG: config.highlightPreTag,
      HIGHLIGHT_POST_TAG: config.highlightPostTag
    };

    const searchLambda = new NodejsFunction(this, 'SearchLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      entry: path.join(__dirname, '/../functions/search.ts'),
      handler: 'searchHandler',
      environment,
    });

    const smartSearchLambda = new NodejsFunction(this, 'SmartSearchLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      entry: path.join(__dirname, '/../functions/search.ts'),
      handler: 'smartSearchHandler',
      environment,
    });

    smartSearchLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['translate:TranslateText'],
      resources: ['*'],
    }));

    const api = new apigateway.RestApi(this, 'SearchApi', {
      restApiName: 'Search Service',
    });

    const smartSearchResource = api.root.addResource('smart-search');
    smartSearchResource.addMethod('POST', new apigateway.LambdaIntegration(smartSearchLambda));

    const searchResource = api.root.addResource('search');
    searchResource.addMethod('POST', new apigateway.LambdaIntegration(searchLambda));

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL of the Search API',
    });
  }
}

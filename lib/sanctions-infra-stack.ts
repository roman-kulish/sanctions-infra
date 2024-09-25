import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from 'node:path';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import config from '../config';

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
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      entry: path.join(__dirname, '/../functions/search.ts'),
      handler: 'searchHandler',
      environment,
    });

    const smartSearchLambda = new NodejsFunction(this, 'SmartSearchLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      entry: path.join(__dirname, '/../functions/search.ts'),
      handler: 'smartSearchHandler',
      environment,
    });

    smartSearchLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['translate:TranslateText'],
      resources: ['*'],
    }));

    const httpApi = new apigatewayv2.HttpApi(this, 'SearchHttpApi', {
      apiName: 'Search Service',
      corsPreflight: {
        allowOrigins: ['*'], 
        allowMethods: [
          apigatewayv2.CorsHttpMethod.POST,
        ],
        allowHeaders: ['Origin', 'Accept', 'Content-Type'],
      },
    });

    httpApi.addRoutes({
      path: '/smart-search',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('SmartSearchIntegration', smartSearchLambda),
    });

    httpApi.addRoutes({
      path: '/search',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('SearchIntegration', searchLambda),
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url!,
      description: 'URL of the Search API',
    });
  }
}

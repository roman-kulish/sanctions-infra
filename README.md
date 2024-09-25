# Sanctions Search CDK Stack

This AWS CDK project deploys a serverless architecture for sanctions search, featuring:

* **Node.js Lambda Function:** Handles search logic and integration with Amazon Translate.
* **API Gateway:** Provides REST API endpoints (`/smart-search` and `/search`) for frontend interaction.
* **S3 Bucket:** Hosts the static frontend UI files.

## Prerequisites:

* Node.js and npm
* AWS CLI configured with credentials
* AWS CDK (`npm install -g aws-cdk`)

## Important:

* **Rename and Edit `config/config.ts.example`:** 
    * Create a copy of `config/config.ts.example` and name it `config/config.ts`.
    * Fill in the required configuration values (Meilisearch host, API key, etc.) in `config/config.ts`.

## Deployment:

1. `npm install` (install project dependencies)
2. `cdk bootstrap` (if not already done)
3. `cdk deploy` 

The API Gateway URL will be outputted after successful deployment.

## Notes:

* The Lambda function has necessary IAM permissions to call Amazon Translate.
* You'll likely want to configure a custom domain and HTTPS using Cloudflare or a similar service.

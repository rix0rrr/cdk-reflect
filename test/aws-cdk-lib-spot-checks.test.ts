import * as fs from 'fs-extra';
import { extractConstructInfo, ConstructInfoReader } from '../src';

jest.setTimeout(30_000);

let result: Awaited<ReturnType<typeof extractConstructInfo>>;
beforeAll(async () => {
  result = await extractConstructInfo({
    assemblyLocations: ['node_modules/aws-cdk-lib'],
  });
  await fs.writeJson('test.json', result.constructInfo, { spaces: 2 });
  await fs.writeFile('warnings.txt', result.diagnostics.map(d => `- ${d.fqn}: ${d.message}`).join('\n'), { encoding: 'utf-8' });
});

test('check that some constructs are recognized', async () => {
  expect(result.constructInfo.constructs['aws-cdk-lib.Stack']).toBeTruthy();
  expect(result.constructInfo.constructs['aws-cdk-lib.aws_dynamodb.Table']).toBeTruthy();
});

test('find required parameters that are constructs', async () => {
  const fqn = 'aws-cdk-lib.aws_elasticloadbalancingv2.ApplicationListener';
  const type = result.constructInfo.constructs[fqn].constructPropertyTypes?.[0];

  expect(result.constructInfo.structs[type?.structFqn ?? '']).toEqual(expect.objectContaining({
    properties: expect.objectContaining({
      loadBalancer: expect.objectContaining({
        types: [
          {
            constructFqn: 'aws-cdk-lib.aws_elasticloadbalancingv2.ApplicationLoadBalancer',
            kind: 'construct',
          },
        ],
      }),
    }),
  }));
});

test('check that some enum classes are recognized', async () => {
  expect(result.constructInfo.enumClasses['aws-cdk-lib.aws_applicationautoscaling.Schedule']).toEqual(expect.objectContaining({
    factories: [
      expect.objectContaining({ methodName: 'at' }),
      expect.objectContaining({ methodName: 'cron' }),
      expect.objectContaining({ methodName: 'expression' }),
      expect.objectContaining({ methodName: 'rate' }),
    ],
  }));
});

test('detect enum class that returns explicit subclasses', () => {
  // 'aws_appmesh.TlsValidationTrust' is a class where the factories show the
  // subclasses they return. Make sure we detect those.
  const fqn = 'aws-cdk-lib.aws_appmesh.TlsValidationTrust';
  expect(result.constructInfo.enumClasses[fqn]).toBeTruthy();
  expect(result.constructInfo.enumClasses[fqn].factories).toContainEqual(expect.objectContaining({
    methodName: 'sds',
  }));
});

test('detect enum class that has statically initialized properties', () => {
  // 'aws_s3.StorageClass' is a class which has static readonly properties that
  // represent the different options.
  const fqn = 'aws-cdk-lib.aws_s3.StorageClass';
  expect(result.constructInfo.enumClasses[fqn]).toBeTruthy();
  expect(result.constructInfo.enumClasses[fqn].singletons).toContainEqual(expect.objectContaining({
    propertyName: 'INFREQUENT_ACCESS',
  }));
});

test('check some integrations', async () => {
  const reader = new ConstructInfoReader(result.constructInfo);
  const integs = reader.integrationsBySource('aws-cdk-lib.aws_sns.Topic');

  expect(integs).toContainEqual(expect.objectContaining({
    targetConstructFqn: 'aws-cdk-lib.aws_lambda.Function',
    integrationName: 'Subscription',
    methodName: 'addSubscription',
    integrationOptionsTypes: [
      {
        kind: 'struct',
        structFqn: 'aws-cdk-lib.aws_sns_subscriptions.LambdaSubscriptionProps',
      },
    ],
  }));
});

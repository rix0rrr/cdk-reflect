import * as fs from 'fs-extra';
import { extractConstructInfo, ConstructInfoReader } from '../src';

jest.setTimeout(30_000);

let result: Awaited<ReturnType<typeof extractConstructInfo>>;
beforeAll(async () => {
  result = await extractConstructInfo({
    assemblyLocations: ['node_modules/aws-cdk-lib'],
  });
  await fs.writeJson('test.json', result.constructInfo, { spaces: 2 });
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

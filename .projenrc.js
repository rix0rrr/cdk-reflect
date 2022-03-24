const { typescript } = require('projen');

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'cdk-reflect',
  repository: 'https://github.com/cdklabs/cdk-reflect',
  authorEmail: 'aws-cdk-dev@amazon.com',
  authorName: 'Amazon Web Servies',
  authorOrganization: true,
  description: 'Reflect on CDK construct libraries',
  deps: [
    'jsii-reflect',
    'fs-extra',
    'yargs',
    '@jsii/spec',
  ],
  devDeps: [
    '@types/jest',
    '@types/yargs',
    'jest',
    '@types/fs-extra',
    'typescript',
    'aws-cdk-lib',
    'constructs',
  ],
  releaseToNpm: true,
  gitignore: ['*.js', '*.d.ts'],
});

project.synth();

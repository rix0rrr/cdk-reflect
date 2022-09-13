import * as fs from 'fs-extra';
import * as yargs from 'yargs';
import { AwsBiaser, AWS_CUSTOM_DISTRIBUTIONS } from './construction/aws-biaser';
import { Evaluator } from './construction/evaluate';
import { parseValueSources } from './construction/extract-distribution';
import { ValueGenerator } from './construction/generate';
import { ValueMutator } from './construction/mutate';
import { Random } from './construction/random';
import { discretize, printStatement } from './construction/statements';
import { Value } from './construction/values';

async function main() {
  await yargs
    .command('extract <ASSEMBLY..>', 'Extract builder model', cmdargs => cmdargs
      .option('output', {
        alias: 'o',
        type: 'string',
        describe: 'Where to write the extracted model',
        requiresArg: true,
      })
      .positional('ASSEMBLY', {
        type: 'string',
        array: true,
        required: true,
      })
      .demandOption('output'),
    async (args) => {
      const assemblyDirs = (args.ASSEMBLY ?? []).map(x => `${x}`);

      const result = await parseValueSources({
        assemblyLocations: assemblyDirs,
        biaser: new AwsBiaser(),
      });

      await fs.writeJson(args.output, result.model, { spaces: 2, encoding: 'utf-8' });
    })
    .command('plan <FQN>', 'Plan to build a specific type', cmdargs => cmdargs
      .positional('FQN', {
        type: 'string',
        describe: 'FQN to plan',
        required: true,
      })
      .option('input', {
        alias: 'i',
        type: 'string',
        describe: 'The extracted model',
        requiresArg: true,
      })
      .demandOption('input')
      .option('synth', {
        alias: 's',
        type: 'boolean',
        describe: 'Synthesize the planned type',
        requiresArg: false,
        default: false,
      })
      .option('seed', {
        alias: 'S',
        type: 'number',
        describe: 'PRNG seed',
        requiresArg: true,
      })
      .option('variants', {
        alias: 'V',
        type: 'number',
        describe: 'How many variants to generate',
        requiresArg: true,
        default: 10,
      }),
    async (args) => {
      const model = await fs.readJson(args.input);
      const random = Random.mersenneFromSeed(args.seed);

      const gen = new ValueGenerator(model, random, {
        customDistributions: AWS_CUSTOM_DISTRIBUTIONS,
      });
      let value = gen.minimal(args.FQN!);
      printAndSynth(value, args.synth);

      for (let i = 0; i < args.variants; i++) {
        console.log('--------------------------------------');
        const mutator = new ValueMutator(model, random, {
          variants: 1,
          customDistributions: AWS_CUSTOM_DISTRIBUTIONS,
        });

        value = mutator.mutate(value)[0];
        if (!value) {
          console.log('Could not find any more mutations');
          break;
        }
        printAndSynth(value, args.synth);
      }
    })
    .help()
    .strictOptions()
    .showHelpOnFail(false)
    .argv;

  /**
  // This was all for the declarative model -- we're not doing that right now
  const result = await extractConstructInfo({
    assemblyLocations: assemblyDirs,
  });

  await fs.writeJson(args.output, result.constructInfo, { spaces: 2, encoding: 'utf-8' });

  const pad5 = mkpad(5);

  if (result.diagnostics.length > 0) {
    process.stdout.write('There were warnings:\n');
    for (const diag of result.diagnostics) {
      process.stdout.write(`- ${diag.fqn}: ${diag.message}\n`);
    }
    process.stdout.write(`${pad5(result.diagnostics.length)} warnings.\n`);
  }

  process.stdout.write(`${pad5(size(result.constructInfo.constructs))} constructs\n`);
  process.stdout.write(`${pad5(size(result.constructInfo.enumClasses))} enum classes\n`);
  process.stdout.write(`${pad5(size(result.constructInfo.enums))} enums\n`);
  process.stdout.write(`${pad5(size(result.constructInfo.structs))} structs\n`);
  process.stdout.write(`${pad5(size(result.constructInfo.integrations))} integrations\n`);
  */
}

/*
function size(xs: Record<string, any>): number {
  return Object.keys(xs).length;
}

function mkpad(n: number) {
  return (x: number) => {
    const s = `${x}`;
    return ' '.repeat(Math.max(n - s.length, 0)) + s;
  };
}
*/

function printAndSynth(value: Value, synth: boolean) {
  // console.log(JSON.stringify(value, undefined, 2));
  const plan = discretize(value);

  if (synth) {
    const synther = new Evaluator({
      printStatements: true,
    });
    const template = synther.synth(discretize(value));
    console.log(JSON.stringify(template, undefined, 2));
  } else {
    // Just print the discretized versions
    for (const statement of plan) {
      console.log(printStatement(statement));
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
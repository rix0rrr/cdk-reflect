import * as fs from 'fs-extra';
import prand from 'pure-rand';
import * as yargs from 'yargs';
import { AwsBiaser } from './construction/aws-biaser';
import { parseValueSources } from './construction/parse-values-sources';
import { MinimalValueGenerator } from './construction/plan';
import { discretize } from './construction/statements';
import { Synthesizer } from './construction/synth';

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
      })
      .option('seed', {
        alias: 'S',
        type: 'number',
        describe: 'PRNG seed',
        requiresArg: true,
      }),
    async (args) => {
      console.log(args);
      const model = await fs.readJson(args.input);
      const rng = prand.mersenne(args.seed ?? Date.now());
      const planner = new MinimalValueGenerator(model, rng, {
        biaser: new AwsBiaser(),
      });
      const value = planner.plan(args.FQN!);
      console.log(JSON.stringify(value, undefined, 2));

      if (args.synth) {
        const synther = new Synthesizer({
          printStatements: true,
        });
        const template = synther.synth(discretize(value));
        console.log(JSON.stringify(template, undefined, 2));
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

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
import * as path from 'path';
import * as fs from 'fs-extra';
import * as yargs from 'yargs';
import { AwsBiaser, AWS_CUSTOM_DISTRIBUTIONS } from './construction/aws-biaser';
import { Evaluator } from './construction/evaluate';
import { parseValueSources } from './construction/extract-distribution';
import { ValueGenerator } from './construction/generate';
import { ValueMutator } from './construction/mutate';
import { Random } from './construction/random';
import { discretize, printStatement, Statement } from './construction/statements';
import { Value } from './construction/values';
import { Histogram } from './histogram';
import { hashJsonObject, timed } from './util';

async function main() {
  await yargs
    .option('verbose', { alias: 'v', type: 'count', description: 'Increase verbosity' })

    //----------------------------------------------------------------------
    //
    //  Extract
    //
    //----------------------------------------------------------------------
    .command('extract <ASSEMBLY..>', 'Extract builder model', cmdargs => cmdargs
      .positional('ASSEMBLY', {
        type: 'string',
        array: true,
        required: true,
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        describe: 'Where to write the extracted model',
        requiresArg: true,
        demandOption: true,
      }),
    async (args) => {
      const assemblyDirs = (args.ASSEMBLY ?? []).map(x => `${x}`);

      const result = await parseValueSources({
        assemblyLocations: assemblyDirs,
        biaser: new AwsBiaser(),
      });

      await fs.writeJson(args.output, result.model, { spaces: 2, encoding: 'utf-8' });
    })
    .command('explore <FQN>', 'Explore the program space to build a specific type', cmdargs => cmdargs
      .positional('FQN', {
        type: 'string',
        describe: 'FQN to plan',
        required: true,
      })
      .option('model', {
        alias: 'm',
        type: 'string',
        describe: 'The extracted model',
        requiresArg: true,
        demandOption: true,
      })
      .option('synth', {
        alias: 's',
        type: 'boolean',
        describe: 'Synthesize the planned values, keeping only successfully synthesizing values',
        requiresArg: false,
        default: false,
      })
      .option('seed', {
        alias: 'S',
        type: 'number',
        describe: 'PRNG seed',
        requiresArg: true,
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        describe: 'Directory to write successfully synthesizing values',
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
      console.error('Reading model');
      const model = await fs.readJson(args.model);
      const random = Random.mersenneFromSeed(args.seed);
      const results = new Histogram<string>();

      console.error('Generating minimal value');
      const gen = new ValueGenerator(model, random, {
        customDistributions: AWS_CUSTOM_DISTRIBUTIONS,
      });
      let value = gen.minimal(args.FQN!);
      await printAndSynth(value, args.verbose, args.synth);
      if (args.output) {
        await saveValue(args.output, value);
      }

      const [seconds] = await timed(async () => {
        for (let i = 0; i < args.variants; i++) {
          if (args.verbose > 0) {
            console.log('--------------------------------------');
          }

          const mutator = new ValueMutator(model, random, {
            variants: 1,
            customDistributions: AWS_CUSTOM_DISTRIBUTIONS,
          });

          const proposedValue = mutator.mutate(value)[0];
          if (!value) {
            console.log('Could not find any more mutations');
            break;
          }

          try {
            await printAndSynth(proposedValue, args.verbose, args.synth);
            results.add('<success>');
            if (args.output) {
              await saveValue(args.output, value);
            }

            // Only take this value for further exploration on successful synth
            value = proposedValue;
          } catch (e: any) {
            results.add(e.message.replace(/\n/g, '; '));
            if (args.verbose > 0) {
              console.log(e.message);
            } else {
              printFlush('x');
            }
          }
        }
      });

      if (args.verbose === 0) {
        printFlush('\n');
      }

      if (args.synth) {
        // Print the final program
        console.log('Most recent successfully synthed program:');
        printProgram(discretize(value));

        console.log(results.print(5));
      }

      console.log(`${seconds.toFixed(1)}s, ${(args.variants / seconds).toFixed(2)} mutations/s`);
    })

    //----------------------------------------------------------------------
    //
    //  Synth
    //
    //----------------------------------------------------------------------
    .command('synth <FILE..>', 'Synthesize the given saved programs', cmdargs => cmdargs
      .positional('FILE', {
        type: 'string',
        array: true,
        required: true,
      }),
    async (args) => {
      for (const file of args.FILE ?? []) {
        const value: Value = await fs.readJson(file);

        const template = await printAndSynth(value, args.verbose, true);
        if (args.verbose >= 2) {
          console.log(JSON.stringify(template, undefined, 2));
        }
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

async function saveValue(directory: string, value: Value) {
  await fs.mkdirp(directory);
  const fname = path.join(directory, `${hashJsonObject(value, 32)}.json`);
  await fs.writeJson(fname, value, { spaces: 2 });
}

async function printAndSynth(value: Value, verbose: number, synth: boolean) {
  let program = discretize(value);
  let template;

  if (verbose > 0) {
    printProgram(program);
  }
  if (synth) {
    template = synthProgram(program);
  }
  if (verbose === 0) {
    printFlush('.');
  }
  return template;
}

function printProgram(program: Statement[]) {
  for (const statement of program) {
    console.log(printStatement(statement));
  }
}

function synthProgram(program: Statement[]): any {
  const synther = new Evaluator();
  return synther.synth(program);
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});

function printFlush(x: string) {
  process.stdout.write(x);
}
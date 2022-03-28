import * as fs from 'fs-extra';
import * as yargs from 'yargs';
import { extractConstructInfo } from './extract-construct-info';

async function main() {
  const args = await yargs
    .usage('$0 <ASSEMBLY..>')
    .option('output', {
      alias: 'o',
      type: 'string',
      describe: 'Where to write the extracted model',
      requiresArg: true,
    })
    .demandOption('output')
    .help()
    .strictOptions()
    .showHelpOnFail(false)
    .argv;

  const assemblyDirs = args._.map(x => `${x}`);

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
}

function size(xs: Record<string, any>): number {
  return Object.keys(xs).length;
}

function mkpad(n: number) {
  return (x: number) => {
    const s = `${x}`;
    return ' '.repeat(Math.max(n - s.length, 0)) + s;
  };
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
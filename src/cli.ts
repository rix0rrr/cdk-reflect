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
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
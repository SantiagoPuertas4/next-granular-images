import chalk from 'chalk';
import { init } from './commands/init';
import { generate } from './commands/generate';
import { optimize } from './commands/optimize';
import { clean } from './commands/clean';

const run = async () => {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = args.slice(1);

  const hasFlag = (name: string) => flags.includes(name);

  try {
    switch (command) {
      case 'init': {
        const buildIndex = args.indexOf('--build');
        let buildMode: string | undefined = undefined;

        if (buildIndex !== -1) {
          const nextArg = args[buildIndex + 1];
          if (nextArg && !nextArg.startsWith('--')) {
            buildMode = nextArg;
          } else {
            buildMode = 'prod';
          }
        }

        await init({ build: buildMode });
        break;
      }
      case 'generate':
        await generate({
          breakpoints: hasFlag('--breakpoints'),
          images: hasFlag('--images'),
        });
        break;
      case 'optimize':
        await optimize({
          fast: hasFlag('--fast'),
          dev: hasFlag('--dev'),
          report: hasFlag('--report'),
        });
        break;
      case 'clean':
        await clean({
          image: hasFlag('--image'),
          breakpoints: hasFlag('--breakpoints'),
          all: hasFlag('--all'),
        });
        break;
      default:
        console.log(
          chalk.red(
            'Unknown command. Available commands: init, generate, optimize, clean'
          )
        );
        process.exit(1);
    }
  } catch (err) {
    console.error(chalk.red('Fatal Error:'), err);
    process.exit(1);
  }
};

run();

import { Command } from "commander";
import { readFile } from "fs/promises";
import makeLog from "../lib/log.js";
import config from "../lib/config.js";

const commandModules = ["play"];

export default function () {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export async function main() {
  const pkgJson = JSON.parse(
    await readFile(
      new URL('../package.json', import.meta.url)
    )
  );
  const program = new Command();
  program.version(pkgJson.version);
  for (const name of commandModules) {
    const module = await import(`./${name}.js`);
    module.default(init, program);
  }
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

const init =
  (fn) =>
  (...args) =>
    (async () => {
      const command = args[args.length - 1];
      const commandName = command._name;
      const log = makeLog(commandName);
      try {
        const context = { config, log };
        await fn(...args, context);
      } catch (error) {
        log.error(error);
      }
    })();

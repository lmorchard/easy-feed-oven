const config = require("../lib/config");
const makeLog = require("../lib/log");
const { setupModels } = require("../models");
const { Command } = require("commander");
const pkgJson = require("../package.json");

module.exports = () => {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });  
};

async function main() {
  const program = new Command();
  program.version(pkgJson.version);
  const commandModules = [
    "build",
    "add-feed",
    "remove-feed",
    "opml-import",
    "poll-feeds",
  ];
  commandModules.forEach((name) => require(`./${name}`)(init, program));
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
} 

const init = (fn) => (...args) =>
  (async () => {
    const command = args[args.length - 1];
    const commandName = command._name;
    const log = makeLog(commandName);
    const models = await setupModels({ config });
    const exit = (code = 0) => {
      models.knex.destroy(() => process.exit(code));
    };
    try {
      const context = { config, log, models, exit };
      await fn(...args, context);
    } catch (error) {
      log.error(error);
    }
  })();

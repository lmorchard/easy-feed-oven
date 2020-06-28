const config = require("../lib/config");
const makeLog = require("../lib/log");
const { setupModels } = require("../models");

async function setupCommands(program) {
  const commandModules = ["opml-import", "poll-feeds"];
  commandModules.forEach((name) => require(`./${name}`)(init, program));
}

const init = (fn, commandName) => (...args) =>
  (async () => {
    const log = makeLog(commandName);
    const command = args[args.length - 1];
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

module.exports = { setupCommands };

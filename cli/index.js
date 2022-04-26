const { Command } = require("commander");
const pkgJson = require("../package.json");
const makeLog = require("../lib/log");
const config = require("../lib/config");

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
    "play",
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
    try {
      const context = { config, log };
      await fn(...args, context);
    } catch (error) {
      log.error(error);
    }
  })();

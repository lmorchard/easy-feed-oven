const util = require("util");
const fs = require("fs");
const readFile = util.promisify(fs.readFile);

module.exports = (init, program) => {
  program
    .command("opml-import [filename]")
    .description("import from OPML")
    .action(init(command));
};

async function command(filename, env, context) {
  const { models, log, exit } = context;
  const { Feed } = models;

  const stream = fs.createReadStream(filename, { encoding: "utf8" });

  const count = await Feed.importOpmlStream(stream, context);

  log.info("Imported %s feeds", count);

  exit();
}

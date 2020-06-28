#!/usr/bin/env node
const util = require("util");
const path = require("path");
const mkdirp = require("mkdirp");
const rimraf = util.promisify(require("rimraf"));

const fs = require("fs");

const { Command } = require("commander");
const config = require("./lib/config");
const log = require("./lib/log")(__filename);
const { parseOpmlStream } = require("./lib");

const pkgJson = require("./package.json");
const program = new Command();
program.version(pkgJson.version);

async function main() {
  await program.parseAsync(process.argv);
}

program.command("play").description("play").action(async () => {
  log.debug({ env: config.env });
  log.debug({ config });

  const filename = "./sample.opml";
  const stream = fs.createReadStream(filename, { encoding: "utf8" });
  const opml = await parseOpmlStream({ stream, log });

  log.debug({ opml: opml.items });
});

program.command("clean").description("clean existing build").action(cleanBuild);

async function cleanBuild() {
  await rimraf(config.buildPath);
  await mkdirp(config.buildPath);
}

/*
program.command("fetch").description("fetch data sources").action(fetchAll);
program.command("build").description("build the page").action(buildAll);

async function buildAll() {
  await buildStyles();
  await buildAssets();
  await buildIndexPage();
}

async function buildIndexPage() {
  const data = JSON.parse(
    await fs.readFile(path.join(config.buildPath, "index.json"))
  );
  const html = indexTemplate({ config, data })();
  await fs.writeFile(path.join(config.buildPath, "index.html"), html);
}

*/

main().catch((err) => console.error(err));

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

const { setupCommands } = require("./cli");

const pkgJson = require("./package.json");
const program = new Command();
program.version(pkgJson.version);

async function main() {
  await setupCommands(program);
  await program.parseAsync(process.argv);
}

program.command("clean").description("clean existing build").action(cleanBuild);

async function cleanBuild() {
  await rimraf(config.buildPath);
  await mkdirp(config.buildPath);
}

program.command("fetch").description("fetch all feeds").action(fetchAll);

async function fetchAll() {
  await mkdirp(config.dataPath);
}

program.command("build").description("build the output sites").action(buildAll);

async function buildAll() {}

main().catch((err) => console.error(err));

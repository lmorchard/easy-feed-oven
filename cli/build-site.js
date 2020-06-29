const util = require("util");
const path = require("path");
const mkdirp = require("mkdirp");
const rimraf = util.promisify(require("rimraf"));
const fs = require("fs");
const {
  fs: { writeFile },
} = require("../lib/files");
const config = require("../lib/config");
const { allFeeds } = require("../templates");

module.exports = (init, program) => {
  program
    .command("clean-site")
    .description("clean existing build")
    .action(init(cleanBuild));
  program
    .command("build-site")
    .description("Build the static site from last feed poll")
    .action(init(buildSite));
};

async function cleanBuild(options, { log }) {
  log.debug("Cleaning site build");
  await rimraf(config.buildPath);
  await mkdirp(config.buildPath);
}

async function buildSite(options, context) {
  const { models, log, exit } = context;
  const { Feed, FeedItem } = models;

  const after = new Date(Date.now() - (1000 * 60 * 60 * 24 * 7)).toISOString();

  const itemLimit = 15;

  const { feeds } = await Feed.queryWithParams({
    folder: null,
    limit: null,
    after: after,
    before: null,
  });

  for (const feed of feeds) {
    const { items } = await FeedItem.queryWithParams({
      feedId: feed.id,
      limit: itemLimit,
      after: after,
    });
    feed.items = items;
  }

  await writeFile(
    path.join(config.buildPath, "index.html"),
    allFeeds({ feeds })(),
    "utf-8"
  );

  exit();
}

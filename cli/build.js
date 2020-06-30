const util = require("util");
const path = require("path");
const mkdirp = require("mkdirp");
const copy = require("recursive-copy");
const rimraf = util.promisify(require("rimraf"));
const fs = require("fs");
const {
  fs: { writeFile },
} = require("../lib/files");
const config = require("../lib/config");
const { allFeeds, feedPage } = require("../templates");

module.exports = (init, program) => {
  program
    .command("clean-site")
    .description("clean existing build")
    .action(init(cleanBuild));
  program
    .command("build-site")
    .description("Build the static site from last feed poll")
    .action(init(buildSite));
  program
    .command("build-assets")
    .description("Build the associated assets requires by the static site")
    .action(init(buildAssets));
};

async function cleanBuild(options, { log }) {
  log.debug("Cleaning site build");
  await rimraf(config.buildPath);
  await mkdirp(config.buildPath);
}

async function buildAssets(options, context) {
  await copy(
    path.join(__dirname, "..", "assets"),
    path.join(config.buildPath),
    {
      overwrite: true,
      debug: true,
    }
  );
  const vendorJS = ["timeago.js/dist/timeago.min.js"];
  for (const fn of vendorJS) {
    await copy(
      path.join(__dirname, "..", "node_modules", fn),
      path.join(config.buildPath, "vendor", path.basename(fn)),
      {
        overwrite: true,
        debug: true,
      }
    );
  }
}

const ITEMS_PER_PAGE = 10;

const pageId = (feed, idx) => `page-${feed.id}-${idx}.html`;

async function buildSite(options, context) {
  const { models, log, exit } = context;
  const { Feed, FeedItem } = models;

  const after = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();

  const { feeds } = await Feed.queryWithParams({
    folder: null,
    limit: null,
    after: after,
    before: null,
  });

  const out = [];

  for (const feed of feeds) {
    const feedOut = feed.toJSON();

    const { items } = await FeedItem.queryWithParams({
      feedId: feed.id,
      limit: 1000,
      after: after,
    });

    const mkPage = () => ({ items: [], nextPage: null });
    const pages = [mkPage()];
    for (const item of items) {
      const page = pages[pages.length - 1];
      page.items.push(item.toJSON());
      if (page.items.length >= ITEMS_PER_PAGE) {
        pages.push(mkPage());
      }
    }

    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx];
      if (pages[idx + 1] && pages[idx + 1].items.length) {
        page.nextPage = pageId(feed, idx + 1);
      }
      if (page.items.length && idx > 0) {
        await writeFile(
          path.join(config.buildPath, pageId(feed, idx)),
          feedPage(page)(),
          "utf-8"
        );
      }
    }

    feedOut.pages = pages;
    out.push(feedOut);
  }

  await writeFile(
    path.join(config.buildPath, "index.html"),
    allFeeds({ feeds: out })(),
    "utf-8"
  );

  exit();
}

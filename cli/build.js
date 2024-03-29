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
const {
  ONE_HOUR,
  THREE_HOURS,
  SIX_HOURS,
  HALF_DAY,
  ONE_DAY,
  THREE_DAYS,
  ONE_WEEK,
} = require("../lib/times");

const ITEMS_PER_PAGE = 50;
const ITEMS_LIMIT = 1000;

const PAGE_AGE_THRESHOLDS = [
  ONE_HOUR,
  THREE_HOURS,
  SIX_HOURS,
  HALF_DAY,
  ONE_DAY,
  THREE_DAYS,
  ONE_WEEK,
];

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
  await writeFile(path.join(config.buildPath, ".nojekyll"), "", "utf-8");
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

async function buildSite(options, context) {
  const { models, log, exit } = context;
  const { Feed, FeedItem } = models;

  const now = Date.now();
  const after = new Date(now - ONE_WEEK).toISOString();

  const { feeds } = await Feed.queryWithParams({ after });
  const allFeedsData = [];
  const feedFolders = {};

  for (const feed of feeds) {
    const feedData = feed.toJSON();

    const { items } = await FeedItem.queryWithParams({
      feedId: feed.id,
      limit: ITEMS_LIMIT,
      after: after,
    });

    const pageTimeThresholds = PAGE_AGE_THRESHOLDS.map((age) =>
      new Date(now - age).toISOString()
    );

    //const pageFileName = (idx) => `page-${now}-${feed.id}-${idx}.html`;
    const pageFileName = (idx) => `page-${feed.id}-${idx}.html`;
    const mkPage = () => ({
      items: [],
      nextPage: null,
      nextPageTime: pageTimeThresholds[1],
    });

    let pages = [mkPage()];
    for (const item of items) {
      const page = pages[pages.length - 1];
      page.items.push(item.toJSON());
      if (pageTimeThresholds.length && item.date < pageTimeThresholds[0]) {
        pageTimeThresholds.shift();
        pages.push(mkPage());
      }
    }
    pages = pages.filter((page) => page.items.length > 0);

    if (!pages.length) {
      continue;
    }

    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx];
      page.thisPage = pageFileName(idx);
      if (pages[idx + 1] && pages[idx + 1].items.length) {
        page.nextPage = pageFileName(idx + 1);
        page.nextPageCount = pages[idx + 1].items.length;
      }
      await writeFile(
        path.join(config.buildPath, pageFileName(idx)),
        feedPage({ feed, page })(),
        "utf-8"
      );
    }

    feedData.pages = pages;

    allFeedsData.push(feedData);
    if (!feedFolders[feed.folder]) {
      feedFolders[feed.folder] = [];
    }
    feedFolders[feed.folder].push(feedData);
  }

  const folderNames = Object.keys(feedFolders);

  await writeFile(
    path.join(config.buildPath, "index.html"),
    allFeeds({ feeds: allFeedsData, folderNames })(),
    "utf-8"
  );

  for (const [folder, feedsData] of Object.entries(feedFolders)) {
    await writeFile(
      path.join(config.buildPath, `${folder}.html`),
      allFeeds({ feeds: feedsData, folderNames })(),
      "utf-8"
    );
  }

  exit();
}

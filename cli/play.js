const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const { parseOpmlStream } = require("../lib");
const { fetchFeed, findFeeds, feedUrlToFilename } = require("../lib/feeds");
const mkdirp = require("mkdirp");

module.exports = (init, program) => {
  program
    .command("feed [feedurl]")
    .description("I use this command to play with ideas")
    .action(init(command));
};

async function command(feedurl, options, command, context) {
  const { log } = context;
  /*
  const stream = fs.createReadStream(filename, { encoding: "utf8" });
  const { meta, items } = await parseOpmlStream({ stream, log });
  log.info(`meta ${meta.title}`);
  for (const item of items) {
    log.info(`items ${JSON.stringify(item)}`);
  }
  */

  /*
  console.log(feed);
  */

  const dataPath = "./data";
  const feedDataPath = "./data/feeds";
  await mkdirp(feedDataPath);

  const data = fs.readFileSync("data/feeds.txt", "UTF-8");
  const lines = data.split(/\r?\n/).filter((line) => !!line);
  for (const feedurl of lines) {
    log.info(`Fetching ${feedurl}`);
    try {
      const { feedUrl, meta, items } = await fetchFeed({ url: feedurl, log });
      const feedFilename = `${await feedUrlToFilename(feedUrl)}.json`;
      log.info(`Writing ${feedFilename}`);
      fs.writeFileSync(
        path.join(feedDataPath, feedFilename),
        JSON.stringify(
          {
            feedUrl,
            meta,
            items,
          },
          null,
          "  "
        )
      );
    } catch (e) {
      log.error(e);
    }
  }
}

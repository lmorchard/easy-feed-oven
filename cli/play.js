import fs from "fs";
import path from "path";
import axios from "axios";
import mkdirp from "mkdirp";
import PQueue from "p-queue";
import { MetaPriorityQueue } from "../lib/queue.js";

import config from "../lib/config.js";
// import { parseOpmlStream } from "../lib/index.js";
import { fetchFeed, findFeeds, feedUrlToFilename } from "../lib/feeds.js";

export default function (init, program) {
  program
    .command("play")
    .description("I use this command to play with ideas")
    .action(init(command));
}

async function command(options, command, context) {
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

  const feedDataPath = "./data/feeds";
  await mkdirp(feedDataPath);

  const data = fs.readFileSync("data/feeds.txt", "UTF-8");
  const lines = data.split(/\r?\n/).filter((line) => !!line);

  const fetchQueue = new PQueue({
    concurrency: config.feedPollConcurrency,
    queueClass: MetaPriorityQueue({
      onAdd: (meta) => {
        log.debug("Fetch queue add %s", JSON.stringify(meta));
      },
      onRun: (meta) => {
        log.debug("Fetch queue run %s", JSON.stringify(meta));
      },
      onResolved: (meta) => {
        log.debug("Fetch queue resolved %s", JSON.stringify(meta));
      },
    }),
  });

  const timeStart = Date.now();

  const queueStatusTimer = setInterval(() => {
    log.info(
      "Fetch queue status (%s / %s)",
      fetchQueue.pending,
      fetchQueue.size
    );
  }, 1000);

  await Promise.all(
    lines.map((feedurl) =>
      fetchQueue.add(
        async () => {
          log.info(`Fetching ${feedurl}`);
          try {
            const { feedUrl, meta, items } = await fetchFeed({
              url: feedurl,
              log,
            });

            const dataPath = path.join(
              feedDataPath,
              await feedUrlToFilename(feedUrl)
            );
            await mkdirp(dataPath);

            log.info(`Writing ${dataPath}`);

            const metaData = { url: feedUrl, meta };
            fs.writeFileSync(
              path.join(dataPath, "meta.json"),
              JSON.stringify(metaData, null, "  ")
            );
            fs.writeFileSync(
              path.join(dataPath, "items.json"),
              JSON.stringify(items, null, "  ")
            );
          } catch (e) {
            log.error(e);
          }
        },
        { meta: { feedurl } }
      )
    )
  );

  log.info("Feed polling complete. (%sms)", Date.now() - timeStart);

  clearInterval(queueStatusTimer);
}

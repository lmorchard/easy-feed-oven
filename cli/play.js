import fs from "fs";
import PQueue from "p-queue";
import { MetaPriorityQueue } from "../lib/queue.js";
import { Feed } from "../lib/models.js";

export default function (init, program) {
  program
    .command("play")
    .description("I use this command to play with ideas")
    .action(init(command));
}

async function command(options, command, context) {
  const { config, log } = context;
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

  const data = fs.readFileSync("data/feeds.txt", "UTF-8");
  const lines = data.split(/\r?\n/).filter((line) => !!line);

  const fetchQueue = new PQueue({
    concurrency: config.feedPollConcurrency,
    /*
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
    */
  });

  const timeStart = Date.now();

  const queueStatusTimer = setInterval(() => {
    log.info(
      "Fetch queue status (%s / %s)",
      fetchQueue.pending,
      fetchQueue.size
    );
  }, 1000);

  const queueFetch = (url) =>
    fetchQueue.add(
      async () => {
        log.info(`Fetching ${url}`);
        try {
          await new Feed(url, config, log).poll();
        } catch (e) {
          log.error("Unexpected error");
          log.error(e);
        }
      },
      { meta: { url } }
    );

  await Promise.all(lines.map(queueFetch));

  log.info("Feed polling complete. (%sms)", Date.now() - timeStart);

  clearInterval(queueStatusTimer);
}

export const parseOpmlStream = ({ stream }) =>
  new Promise((resolve, reject) => {
    let meta = {};
    const items = [];

    const parser = new OpmlParser();

    parser.on("error", reject);
    parser.on("end", () => resolve({ meta, items }));
    parser.on("readable", function () {
      meta = this.meta;
      let outline;
      while ((outline = this.read())) {
        items.push(outline);
      }
    });

    stream.pipe(parser);
  });

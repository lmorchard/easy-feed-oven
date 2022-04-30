import { FeedSet } from "../lib/models/index.js";

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

  const feedSet = new FeedSet(config, log);
  await feedSet.load();
  await feedSet.loadFromTxt("data/feeds.txt");
  await feedSet.poll();
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

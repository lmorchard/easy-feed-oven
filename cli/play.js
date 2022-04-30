import { FeedSet } from "../lib/models/index.js";

export default function (init, program) {
  program
    .command("play")
    .description("I use this command to play with ideas")
    .action(init(command));
}

async function command(options, command, context) {
  const { config, log } = context;

  const feedSet = new FeedSet(config, log);
  await feedSet.load();
  await feedSet.loadFromTxt("data/feeds.txt");
  await feedSet.poll();
}

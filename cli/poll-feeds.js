const { default: PQueue } = require('p-queue');
const { MetaPriorityQueue } = require("../lib/queue");

module.exports = (init, program) => {
  program
    .command("poll-feeds")
    .description("Poll feeds for updated content")
    .option("-f, --force", "Force polling on fresh feeds")
    .action(init(command, "poll-feeds"));
};

async function command(options, env, context) {
  const { models, log, exit } = context;
  const { knex, Feed, FeedItem } = models;

  const timeStart = Date.now();

  const { count } = await knex.from("Feeds").count({ count: "*" }).first();
  log.info("Polling %s feeds...", count);

  const fetchQueue = new PQueue({
    concurrency: 8,
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

  const queueStatusTimer = setInterval(() => {
    log.info(
      "Fetch queue status (%s / %s)",
      fetchQueue.pending,
      fetchQueue.size
    );
  }, 1000);

  await Feed.pollAll(fetchQueue, context, options);
  await FeedItem.purgeDefunct(context);

  log.info("Feed polling complete. (%sms)", Date.now() - timeStart);

  clearInterval(queueStatusTimer);
  exit();
}

module.exports = (init, program) => {
  program
    .command("remove-feed [idOrUrl]")
    .description("Remove feed by ID or URL")
    .action(init(command));
};

async function command(idOrUrl, options, context) {
  const { models, log, exit } = context;
  const { Feed, FeedItem } = models;

  const feeds = await Feed.query()
    .where("id", idOrUrl)
    .orWhere("resourceUrl", idOrUrl)
    .orWhere("link", idOrUrl);

  if (feeds.length === 0) {
    log.info("No feeds found.");
    return exit();
  }

  if (feeds.length > 1) {
    log.info("Found multiple feeds:");
    for (let feed of feeds) {
      log.info("  %s %s (%s)", feed.id, feed.title, feed.resourceUrl);
    }
    log.info("Try picking one by ID, none deleted.");
    return exit();
  }

  const feed = feeds[0];
  const itemCount = await FeedItem.query()
    .where("feed_id", feed.id)
    .del();
  const feedCount = await feed.$query().del();

  log.info("Deleted %s feed and %s items.", feedCount, itemCount);
  exit();
}

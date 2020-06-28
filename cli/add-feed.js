const stream = require("stream");
const cheerio = require("cheerio");

const {
  fetchResource,
  parseFeedStream,
} = require("../lib");

module.exports = (init, program) => {
  program
    .command("add-feed [url]")
    .description(
      "Add a new feed subscription by feed URL or discovered via HTML URL"
    )
    .option("-f, --folder [name]", "Folder name for the new feed")
    .action(init(command));
};

async function command(url, options, context) {
  const { models, log, exit } = context;
  const { Feed } = models;

  let feedUrl = url;

  let response, body;
  try {
    response = await fetchResource({ resourceUrl: url });
    body = await response.text();
  } catch (e) {
    log.error("Failed to fetch URL: %s", e);
    return exit();
  }

  try {
    const $ = cheerio.load(body);
    const links = $('link[type*="rss"], link[type*="atom"], link[type*="rdf"]');
    if (links.length > 0) {
      log.info(
        "Found feed links: %s",
        links
          .map((i, el) => $(el).attr("href"))
          .get()
          .join(", ")
      );
      feedUrl = links.first().attr("href");
      response = await fetchResource({ resourceUrl: feedUrl });
      body = await response.text();
    }
  } catch (e) {
    log.error("Failed to discover feed: %s", e);
    return exit();
  }

  let meta;
  try {
    const bodyStream = new stream.Readable();
    bodyStream._read = () => {};
    bodyStream.push(body);
    bodyStream.push(null);

    ({ meta } = await parseFeedStream(
      { stream: bodyStream, resourceUrl: url },
      context
    ));
  } catch (e) {
    log.error("Failed to fetch feed: %s", e);
    return exit();
  }

  let feed;
  try {
    const { title, description, link } = meta;
    feed = await Feed.importFeed(
      {
        title,
        description,
        htmlurl: link,
        xmlurl: feedUrl,
        folder: options.folder,
      },
      context
    );
    log.info("Added feed %s (%s) %s", feed.title, feed.resourceUrl, feed.id);
  } catch (e) {
    log.error("Failed to import feed: %s", e);
    return exit();
  }

  try {
    await feed.pollFeed(context);
  } catch (e) {
    log.error("Failed to poll feed: %s", e);
    return exit();
  }

  exit();
}

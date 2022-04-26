import { Readable } from "stream";
import { URL } from "url";
import axios from "axios";
import * as cheerio from 'cheerio';
import FeedParser from "feedparser";

class FeedParseError extends Error {}

export async function fetchFeed({ url, log: parentLog }) {
  const log = parentLog.child({ name: "fetchFeed" });

  let response, feedData, feedUrl;

  feedUrl = url;
  response = await axios.get(url, { timeout: 5000 });
  log.debug(`fetched ${url}`);

  if (response.headers["content-type"].startsWith("text/html")) {
    const feedUrls = await findFeeds({
      baseUrl: url,
      data: response.data,
      log,
    });
    if (feedUrls.length === 0) {
      throw new FeedParseError("No feeds found.");
    }
    log.debug(`found ${feedUrls.length} feeds from HTML content`);

    feedUrl = feedUrls[0];
    response = await axios.get(feedUrl, { timeout: 5000 });
    log.debug(`fetched ${feedUrl}`);
  }

  feedData = response.data;
  return {
    feedUrl,
    ...(await parseFeedStream({
      stream: Readable.from(feedData),
      resourceUrl: feedUrl,
      log,
    })),
  };
}

const FEED_LINKS_QUERY = [
  'link[type*="rss"]',
  'link[type*="application/rss+xml"]',
  'link[type*="atom"]',
  'link[type*="rdf"]',
].join(",");

export async function findFeeds({ baseUrl, data, log }) {
  const $ = cheerio.load(data);
  return $(FEED_LINKS_QUERY)
    .map((i, el) => {
      const href = $(el).attr("href");
      return new URL(href, baseUrl).toString();
    })
    .toArray();
}

export const parseFeedStream = ({ stream, resourceUrl, log = defaultLog }) =>
  new Promise((resolve, reject) => {
    let meta;
    const items = [];

    const parser = new FeedParser({
      addmeta: false,
      feedurl: resourceUrl,
    });

    parser.on("error", reject);
    parser.on("end", () => resolve({ meta, items }));
    parser.on("readable", function () {
      meta = this.meta;
      let item;
      while ((item = this.read())) {
        items.push(item);
      }
    });

    stream.pipe(parser);
  });

export async function feedUrlToFilename(feedUrl) {
  // HACK: don't need this if we do a normal module import
  const { createHash } = await import("crypto");
  return createHash("sha1").update(feedUrl).digest("hex");

  /*
  // HACK: don't need this if we do a normal module import
  const { default: filenamifyUrl } = await import("filenamify-url");
  return filenamifyUrl(feedUrl, { replacement: "_" });
  */
}

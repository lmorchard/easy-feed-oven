import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import filenamifyUrl from "filenamify-url";

import { Readable } from "stream";
import { URL } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import FeedParser from "feedparser";
import makeLog from "../lib/log";

const FEED_LINKS_QUERY = [
  'link[type*="rss"]',
  'link[type*="application/rss+xml"]',
  'link[type*="atom"]',
  'link[type*="rdf"]',
].join(",");

export class FeedError extends Error {}
export class FeedNotFoundError extends FeedError {}

export class Feed {
  constructor(url, config = {}, log = makeLog("Feed")) {
    Object.assign(this, {
      url,
      feedUrl: url,
      config,
      log,
      meta: new FeedMeta(this),
      items: new FeedItems(this),
    });
  }

  async load() {
  }

  async save() {
    await this.meta.save();
    await this.items.save();
  }

  async fetch() {
    const { config, log } = this;
    const { fetchTimeout = 5000 } = config;

    // First, fetch the URL as given
    let feedUrl = this.url;
    let response = await axios.get(feedUrl, { timeout: fetchTimeout });

    // If the URL leads to HTML content, try to auto-detect feeds
    if (response.headers["content-type"].startsWith("text/html")) {
      const feedUrls = await this.findFeedsFromHTML(feedUrl, response.data);
      log.debug(`found ${feedUrls.length} feeds from HTML content`);
      if (feedUrls.length === 0) {
        throw new FeedNotFoundError(`No feed found at ${feedUrl}`);
      }

      // We found feeds, so make another request to fetch the first one found
      // TODO: do something more interesting with multiple feeds?
      feedUrl = feedUrls[0];
      response = await axios.get(feedUrl, { timeout: fetchTimeout });
      log.debug(`fetched ${feedUrl}`);
    }

    // Stash away the actual feed URL and the raw response body
    this.feedUrl = feedUrl;
    this.data = response.data;

    // Try parsing what we think is a feed and grab the metadata and items
    const parsed = await this.parseFeed(response.data);
    this.meta = FeedMeta.fromFeedParser(this, parsed);
    this.items = FeedItems.fromFeedParser(this, parsed);

    return this;
  }

  async findFeedsFromHTML(baseUrl, body) {
    const $ = cheerio.load(body);
    return $(FEED_LINKS_QUERY)
      .map((i, el) => {
        const href = $(el).attr("href");
        return new URL(href, baseUrl).toString();
      })
      .toArray();
  }

  async baseFilePath() {
    const { dataPath = "./data" } = this.config;
    const urlHash = createHash("sha1").update(this.url).digest("hex");
    // const urlHash = filenamifyUrl(this.url, { replacement: "_" });
    return path.join(dataPath, "feeds", urlHash);
  }

  async parseFeed(url, data) {
    return new Promise((resolve, reject) => {
      const stream = Readable.from(data);

      let meta;
      const items = [];

      const parser = new FeedParser({
        addmeta: false,
        feedurl: url,
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
  }
}

export class FeedMeta {
  constructor(feed, meta = {}) {
    Object.assign(this, { feed, meta });
  }

  async save() {
    return fs.writeFile(
      this.filePath(),
      JSON.stringify(this.toJSON(), null, "  ")
    );
  }

  updateFromFeedParser({ meta: parserMeta }) {
    // TODO: massage the data here, someday
    const meta = { ...parserMeta };
    this.meta = meta;
  }

  filePath() {
    return path.join(this.feed.baseFilePath(), "meta.json");
  }

  toJSON() {
    return this.meta;
  }
}

export class FeedItems {
  constructor(feed, items = []) {
    Object.assign(this, { feed, items });
  }

  async save() {
    return fs.writeFile(
      this.filePath(),
      JSON.stringify(this.toJSON(), null, "  ")
    );
  }

  updateFromFeedParser({ items: parserItems }) {
    // TODO: massage the data here, someday
    const items = parserItems.map(item => new FeedItem(this.feed, {...item}));
    this.items = items;
  }

  filePath() {
    return path.join(this.feed.baseFilePath(), "item.json");
  }

  toJSON() {
    return this.items.map(item => item.toJSON());
  }
}

export class FeedItem {
  constructor(feed, item) {
    Object.assign(this, { feed, item });
  }

  toJSON() {
    return this.item;
  }

  updateFromFeedParser(parserItem) {
    const item = {...parserItem};
    this.item = item;
  }
}

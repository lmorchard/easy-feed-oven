import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import filenamifyUrl from "filenamify-url";
import mkdirp from "mkdirp";

import { Readable } from "stream";
import { URL } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import FeedParser from "feedparser";
import makeLog from "../lib/log.js";

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
    await this.meta.load();
    await this.items.load();
  }

  async save() {
    this.log.info(`Writing ${this.baseFilePath()} ${this.url}`);

    await mkdirp(this.baseFilePath());
    await this.items.save();
    await this.meta.save();
  }

  async fetch() {
    const { config, log } = this;
    const { fetchTimeout } = config;

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
    const parsed = await this.parseFeed(this.feedUrl, this.data);
    await this.updateFromFeedParser(parsed);

    return this;
  }

  async updateFromFeedParser(parsed) {
    await this.meta.updateFromFeedParser(parsed);
    await this.items.updateFromFeedParser(parsed);
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

  baseFilePath() {
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

  async load() {}

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

  async load() {}

  async save() {
    const { config, log } = this.feed;
    const { feedItemMaxAge = 60 * 60 * 24 * 7 } = config;

    const now = Date.now();

    const sortedItems = this.items
      .filter(
        (item) => now - Date.parse(item.item.itemDate) < feedItemMaxAge * 1000
      )
      .sort((a, b) => b.dateCompare(a));

    const itemsByDate = sortedItems.reduce((acc, item) => {
      const itemDate = new Date(item.item.itemDate);
      const itemYear = itemDate.getUTCFullYear();
      const itemMonth = itemDate.getUTCMonth() + 1;
      const itemDay = itemDate.getUTCDate();
      const itemKey = [
        itemYear,
        itemMonth.toString().padStart(2, "0"),
        itemDay.toString().padStart(2, "0"),
      ].join("-");
      return {
        ...acc,
        [itemKey]: [item, ...(acc[itemKey] || [])],
      };
    }, {});

    log.debug(
      `dates ${this.feed.url} - ${JSON.stringify(Object.keys(itemsByDate))}`
    );

    for (const [key, items] of Object.entries(itemsByDate)) {
      await fs.writeFile(
        path.join(this.feed.baseFilePath(), `items-${key}.json`),
        JSON.stringify(
          items.map((item) => item.toJSON()),
          null,
          "  "
        )
      );
    }
    /*
    return fs.writeFile(
      this.filePath(),
      JSON.stringify(this.toJSON(), null, "  ")
    );
    */
  }

  updateFromFeedParser({ items: parserItems }) {
    // TODO: massage the data here, someday
    const items = parserItems.map((parserItem) =>
      new FeedItem(this.feed).updateFromFeedParser({ ...parserItem })
    );
    this.items = items;
  }

  filePath() {
    return path.join(this.feed.baseFilePath(), "items.json");
  }

  toJSON() {
    return this.items.map((item) => item.toJSON());
  }
}

export class FeedItem {
  constructor(feed, item = {}) {
    Object.assign(this, { feed, item });
  }

  toJSON() {
    return this.item;
  }

  dateCompare(other) {
    return this.item.itemDate.localeCompare(other.item.itemDate);
  }

  updateFromFeedParser(parserItem) {
    const {
      guid,
      title,
      link,
      date,
      pubdate,
      description,
      summary,
      author,
      image,
      source,
      categories,
      enclosures,
    } = parserItem;

    const now = new Date();
    const candidate = new Date(date || pubdate || created_at || now);
    const itemDate = candidate < now ? candidate : now;

    const itemGuid =
      guid ||
      crypto.createHash("sha1").update(title).update(link).digest("hex");

    this.item = {
      itemDate: itemDate.toISOString(),
      itemGuid,
      guid,
      title,
      link,
      date,
      pubdate,
      description,
      summary,
      author,
      image,
      source,
      categories,
      enclosures,
      // TODO: option to include full parsed item data?
      // ...parserItem,
    };

    return this;
  }
}

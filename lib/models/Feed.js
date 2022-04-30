import path from "path";
import { createHash } from "crypto";

import { Readable } from "stream";
import { URL } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import FeedParser from "feedparser";
import makeLog from "../log.js";
import { indexBy, writeJSONFile, readJSONFileIfExists } from "../misc.js";

import { BaseFeedError, FeedParserError, FeedNotFoundError } from "./errors.js";
import { FeedItem, FeedItemPartition } from "./index.js";

const FEED_LINKS_QUERY = [
  'link[type*="rss"]',
  'link[type*="application/rss+xml"]',
  'link[type*="atom"]',
  'link[type*="rdf"]',
].join(",");

export class Feed {
  constructor(url, config = {}, log = makeLog("Feed")) {
    Object.assign(this, {
      url,
      feedUrl: url,
      config,
      log,
      meta: {},
    });
  }

  async poll() {
    await this.load();
    const parsed = await this.fetch();
    if (parsed) {
      await this.update(parsed);
    }
    await this.save();
    return this;
  }

  async load() {
    const data = readJSONFileIfExists(this.filePath);
    if (data) {
      this.fromJSON(data);
    }
  }

  async save() {
    return writeJSONFile(this.filePath, this.toJSON());
  }

  get filePath() {
    return path.join(this.baseFilePath, this.fileName);
  }

  get fileName() {
    return "index.json";
  }

  get dirName() {
    return createHash("sha1").update(this.url).digest("hex");
  }

  get baseFilePath() {
    const { dataPath = "./data" } = this.config;
    // const urlHash = filenamifyUrl(this.url, { replacement: "_" });
    return path.join(dataPath, "feeds", this.dirName);
  }

  toJSON() {
    const { url, feedUrl, meta } = this;
    return { url, feedUrl, ...meta };
  }

  fromJSON(data) {
    this.meta = { ...this.meta, ...data };
    return this;
  }

  logError(error) {
    if (!this.meta.errors) {
      this.meta.errors = [];
    }
    this.meta.errors.unshift({
      timestamp: new Date().toISOString(),
      ...error,
    });
  }

  async fetch() {
    const { config, log } = this;
    const { fetchTimeout = 5000 } = config;

    this.meta.lastFetch = new Date().toISOString();

    try {
      // First, fetch the URL as given
      let feedUrl = this.url;
      let response = await axios.get(feedUrl, { timeout: fetchTimeout });

      // If the URL leads to HTML content, try to auto-detect feeds
      if (
        response.headers["content-type"] &&
        response.headers["content-type"].startsWith("text/html")
      ) {
        const feedUrls = await this.findFeedsFromHTML(feedUrl, response.data);
        log.debug(`Found ${feedUrls.length} feeds from HTML content`);
        if (feedUrls.length === 0) {
          throw new FeedNotFoundError(`No feed found at ${feedUrl}`);
        }

        // We found feeds, so make another request to fetch the first one found
        // TODO: do something more interesting with multiple feeds?
        feedUrl = feedUrls[0];
        response = await axios.get(feedUrl, { timeout: fetchTimeout });
        log.debug(`Fetched ${feedUrl}`);
      }

      // Stash away the actual feed URL and the raw response body
      this.feedUrl = feedUrl;
      this.data = response.data;

      try {
        // Try parsing what we think is a feed and grab the metadata and items
        return await this.parseFeed(this.feedUrl, this.data);
      } catch (e) {
        // HACK: re-throw as a local error class
        throw new FeedParserError(e.message);
      }
    } catch (e) {
      if (axios.isAxiosError(e) || e.name === "AxiosError") {
        const { message, code, status } = e;
        this.logError({ name: "FetchError", message, code, status });
      } else if (e instanceof BaseFeedError) {
        this.logError({ name: e.type, message: e.message });
      } else {
        throw e;
      }
    }
  }

  async update(parsed) {
    const { config, log } = this;
    const { feedItemMaxAge = 60 * 60 * 24 * 7 } = config;
    const feedItemMaxAgeMS = feedItemMaxAge * 1000;

    const now = new Date();

    // TODO: massage the data here, someday
    this.meta = { ...this.meta, ...parsed.meta, lastUpdate: now.toISOString() };

    const items = indexBy(
      parsed.items
        .map((parserItem) =>
          new FeedItem(this).updateFromFeedParser(parserItem)
        )
        .filter((item) => item.age < feedItemMaxAgeMS)
        .sort((a, b) => b.dateCompare(a)),
      (item) => item.partitionKey()
    );

    const itemSets = [];
    for (const [partitionKey, incomingItems] of Object.entries(items)) {
      const itemSet = new FeedItemPartition(this, partitionKey);

      await itemSet.load();
      const stats = await itemSet.merge(incomingItems);
      await itemSet.save();

      itemSets.push(itemSet);

      this.log.debug(
        `Saved ${this.url} partition ${partitionKey} with ${stats.newItems.length} new, ${stats.updatedItems.length} updated`
      );
    }

    if (!this.meta.items) {
      this.meta.items = {};
    }
    for (const itemSet of itemSets) {
      const { oldest, newest } = itemSet.dateRange;
      this.meta.items[itemSet.partitionKey] = {
        href: itemSet.fileName,
        oldest,
        newest,
      };
      if (!this.meta.itemsOldestDate || oldest < this.meta.itemsOldestDate) {
        this.meta.itemsOldestDate = oldest;
      }
      if (!this.meta.itemsNewestDate || newest > this.meta.itemsNewestDate) {
        this.meta.itemsNewestDate = newest;
      }
    }
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

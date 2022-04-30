import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import filenamifyUrl from "filenamify-url";
import mkdirp from "mkdirp";
import PQueue from "p-queue";

import { Readable } from "stream";
import { URL } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import FeedParser from "feedparser";
import makeLog from "../lib/log.js";
import {
  indexBy,
  writeJSONFile,
  readJSONFile,
  readJSONFileIfExists,
} from "../lib/misc.js";

const FEED_LINKS_QUERY = [
  'link[type*="rss"]',
  'link[type*="application/rss+xml"]',
  'link[type*="atom"]',
  'link[type*="rdf"]',
].join(",");

export class BaseFeedError extends Error {
  get name() {
    return this.constructor.name;
  }
}
export class FetchError extends BaseFeedError {}
export class FeedParserError extends BaseFeedError {}
export class FeedNotFoundError extends BaseFeedError {}

export class FeedSet {
  constructor(config = {}, log = makeLog("Feed"), basePath = "feeds") {
    Object.assign(this, {
      config,
      log,
      basePath,
      feeds: [],
      index: {},
    });
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

  async loadFromTxt(filename) {
    const { config, log } = this;
    const data = await fs.readFile(filename, "utf-8");
    const lines = data.split(/\r?\n/).filter((line) => !!line);

    this.feeds = lines.map((url) => new Feed(url, config, log));
  }

  async poll() {
    const { config, log } = this;

    const fetchQueue = new PQueue({
      concurrency: config.feedPollConcurrency,
    });

    const timeStart = Date.now();

    const queueStatusTimer = setInterval(() => {
      log.debug(
        "Fetch queue status (%s / %s)",
        fetchQueue.pending,
        fetchQueue.size
      );
    }, 1000);

    const queueFetch = (feed) =>
      fetchQueue.add(async () => {
        log.info(`Fetching ${feed.url}`);
        try {
          await feed.poll();
          this.updateIndex(feed);
          await this.save();
        } catch (e) {
          log.error("Unexpected error");
          log.error(e);
        }
        log.info(`Fetched ${feed.url}`);
      });

    const result = await Promise.all(this.feeds.map(queueFetch));

    log.info("Feed polling complete. (%sms)", Date.now() - timeStart);

    clearInterval(queueStatusTimer);

    return result;
  }

  updateIndex(feed) {
    const { dirName, fileName, url, meta } = feed;
    const {
      title,
      description,
      link,
      lastFetch,
      lastUpdate,
      itemsOldestDate,
      itemsNewestDate,
      errors,
    } = meta;
    this.index[dirName] = {
      href: `${dirName}/${fileName}`,
      url,
      title,
      description,
      link,
      lastFetch,
      lastUpdate,
      itemsNewestDate,
      itemsOldestDate,
      lastError: errors && errors[0],
    };
  }

  toJSON() {
    return this.index;
  }

  fromJSON(indexJson) {
    this.index = indexJson;
    return this;
  }

  get filePath() {
    return path.join(this.baseFilePath, this.fileName);
  }

  get fileName() {
    return "index.json";
  }

  get baseFilePath() {
    const { dataPath = "./data" } = this.config;
    return path.join(dataPath, this.basePath);
  }
}

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
        .map((parserItem) => new FeedItem(this).updateFromFeedParser(parserItem))
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

export class FeedItemPartition {
  constructor(feed, partitionKey, items = []) {
    Object.assign(this, { feed, partitionKey, items });
  }

  async load() {
    const data = await readJSONFileIfExists(this.filePath);
    if (data) this.fromJSON(data);
  }

  async save() {
    await writeJSONFile(this.filePath, this.toJSON());
  }

  get filePath() {
    return path.join(this.feed.baseFilePath, this.fileName);
  }

  get fileName() {
    return `items-${this.partitionKey}.json`;
  }

  toJSON() {
    return this.items.map((item) => item.toJSON());
  }

  fromJSON(jsonItems = []) {
    this.items = jsonItems.map((jsonItem) =>
      new FeedItem(this.feed).fromJSON(jsonItem)
    );
    return this;
  }

  get dateRange() {
    let oldestItem = null;
    let newestItem = null;

    for (const item of this.items) {
      if (!oldestItem || item.dateCompare(oldestItem) < 0) {
        oldestItem = item;
      }
      if (!newestItem || item.dateCompare(newestItem) > 0) {
        newestItem = item;
      }
    }

    return {
      oldest: oldestItem.date,
      newest: newestItem.date,
    };
  }

  async merge(incomingItems) {
    const changes = {
      newItems: [],
      updatedItems: [],
    };

    const existingByGuid = indexBy(this.items, (item) => item.id, true);
    const incomingByGuid = indexBy(incomingItems, (item) => item.id, true);
    const mergedByGuid = { ...existingByGuid };

    for (const [guid, incomingItem] of Object.entries(incomingByGuid)) {
      const existingItem = mergedByGuid[guid];
      if (existingItem) {
        existingItem.merge(incomingItem);
        changes.updatedItems.push(guid);
      } else {
        incomingItem.stampFirstSeen();
        mergedByGuid[guid] = incomingItem;
        changes.newItems.push(guid);
      }
    }

    const merged = Object.values(mergedByGuid);
    merged.sort((a, b) => b.dateCompare(a));
    this.items = merged;

    return changes;
  }
}

export class FeedItem {
  constructor(feed, item = {}) {
    Object.assign(this, { feed, item });
  }

  get id() {
    return this.item.itemGuid;
  }

  get date() {
    return this.item.itemDate;
  }

  get age() {
    return Date.now() - Date.parse(this.item.itemDate);
  }

  toJSON() {
    return this.item;
  }

  fromJSON(data) {
    this.item = { ...data };
    return this;
  }

  merge(incomingItem) {
    this.item = { ...this.item, ...incomingItem.item };
  }

  partitionKey() {
    return this.item.itemDate.split("T")[0];
  }

  dateCompare(other) {
    return this.item.itemDate.localeCompare(other.item.itemDate);
  }

  stampFirstSeen() {
    this.item.itemFirstSeen = new Date().toISOString();
  }

  updateFromFeedParser(parserItem) {
    const {
      guid,
      title,
      link,
      date,
      pubDate,
      description,
      summary,
      author,
      image,
      source,
      categories,
      enclosures,
    } = parserItem;

    const now = new Date();
    const candidate = new Date(date || pubDate || now);
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
      pubDate,
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

import fs from "fs/promises";
import path from "path";
import PQueue from "p-queue";

import makeLog from "../log.js";
import { writeJSONFile, readJSONFileIfExists } from "../misc.js";

import { Feed } from "./index.js";

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

  /*
  async loadFromOPML(filename) {
    const stream = fs.createReadStream(filename, { encoding: "utf8" });
    const { meta, items } = await parseOpmlStream({ stream, log });
    log.info(`meta ${meta.title}`);
    for (const item of items) {
      log.info(`items ${JSON.stringify(item)}`);
    }
  }
  */

  parseOpmlStream({ stream }) {
    return new Promise((resolve, reject) => {
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
}

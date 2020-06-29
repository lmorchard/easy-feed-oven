const { Model } = require("objection");
const guid = require("objection-guid")();

const Iconv = require("iconv").Iconv;
const FeedParser = require("feedparser");
const OpmlParser = require("opmlparser");
const stream = require("stream");
const AbortController = require("abort-controller");
const fetch = require("node-fetch");
const {
  stripNullValues,
  fetchResource,
  parseFeedStream,
  parseOpmlStream,
} = require("../lib");

const { assign } = Object;

const BaseModel = require("./BaseModel");

// Some feeds have an outrageous number of items (e.g. > 500)
// and I'd like to put a clamp on that
// TODO: make MAX_ITEMS_TO_IMPORT configurable?
const MAX_ITEMS_TO_IMPORT = 100;

const DEFAULT_FEED_CHARSET = "utf-8";

class Feed extends guid(BaseModel) {
  static get tableName() {
    return "Feeds";
  }

  static get relationMappings() {
    const FeedItem = require("./FeedItem");
    return {
      items: {
        relation: Model.HasManyRelation,
        modelClass: FeedItem,
        join: {
          from: "Feeds.id",
          to: "FeedItems.feed_id",
        },
      },
    };
  }

  static get uniqueAttributes() {
    return ["resourceUrl"];
  }

  static async queryWithParams({
    id = null,
    folder = null,
    limit = null,
    after = null,
    before = null,
  } = {}) {
    if (id) {
      return {
        feeds: await this.query().findById(id),
        feedsRemaining: 0,
      };
    }

    const applyParams = (result) => {
      if (after) {
        result = result.where("lastNewItem", ">", after);
      }
      if (before) {
        result = result.where("lastNewItem", "<", before);
      }
      if (folder) {
        result = result.where("folder", folder);
      }
      if (limit) {
        result = result.limit(limit);
      }
      return result;
    };

    const { feedsCount } = await applyParams(
      this.query().count("* as feedsCount").first()
    );

    const feeds = await applyParams(
      this.query().orderBy("lastNewItem", "DESC").orderBy("updated_at", "DESC")
    );

    return { feeds, feedsRemaining: Math.max(0, feedsCount - limit) };
  }

  static async queryFolders({ after = null, before = null } = {}) {
    const { API_BASE_URL } = Feed.config();

    let feeds = this.query()
      .orderBy("lastNewItem", "DESC")
      .orderBy("updated_at", "DESC");

    if (after) {
      feeds = feeds.where("lastNewItem", ">", after);
    }
    if (before) {
      feeds = feeds.where("lastNewItem", "<", before);
    }

    feeds = await feeds;

    const folders = {};
    for (let feed of feeds) {
      const folderId = feed.folder || "uncategorized";
      if (!folders[folderId]) {
        folders[folderId] = {
          id: folderId,
          feeds: [],
        };
      }
      const { id, title, lastNewItem } = feed.toJSON();
      folders[folderId].feeds.push({ id, title, lastNewItem });
    }

    return folders;
  }

  static async importOpmlStream(stream, context) {
    const { log } = context;
    const { meta, items } = await parseOpmlStream({ stream }, context);
    let count = 0;
    for (let item of items) {
      if (item["#type"] !== "feed") {
        continue;
      }
      await this.importFeed(item, context);
      count++;
    }
    return count;
  }

  static async importFeed(item, context) {
    const { log } = context;
    const {
      title = "",
      text = "",
      description: subtitle = "",
      xmlurl: resourceUrl = "",
      htmlurl: link = "",
      folder = "",
      ...json
    } = item;
    const feed = await Feed.insertOrUpdate(
      {
        title: text || title,
        subtitle,
        link,
        resourceUrl,
        folder,
        json,
      },
      context
    );
    log.info("Imported feed %s (%s)", feed.title, feed.resourceUrl);
    return feed;
  }

  static async pollAll(fetchQueue, context, options = {}) {
    const { log } = context;
    const feeds = await this.query().select("id", "title");
    log.debug("Enqueueing %s feeds to poll", feeds.length);
    return Promise.all(
      feeds.map(({ id, title }) =>
        fetchQueue.add(() => this.pollFeedById(id, context, options), {
          meta: { id, title },
        })
      )
    );
  }

  static async pollFeedById(id, context, options) {
    const feed = await this.query().where({ id }).first();
    return feed.pollFeed(context, options);
  }

  async pollFeed(context, options = {}) {
    const { log } = context;

    const { force = false, timeout = 20000, maxage = 30 * 60 * 1000 } = options;

    const attrs = Object.assign(
      {},
      {
        disabled: false,
        json: {},
        lastValidated: 0,
      },
      stripNullValues(this.toJSON())
    );

    const { id, title, resourceUrl, disabled, json, lastValidated } = attrs;

    const { headers: prevHeaders = {} } = json;

    const timeStart = Date.now();

    log.debug("Starting poll of %s", title);

    if (disabled) {
      log.info("Skipping disabled feed %s", title);
      return;
    }

    const age = timeStart - lastValidated;
    if (!force && lastValidated !== 0 && age < maxage) {
      log.info("Skipping poll for fresh feed %s (%s < %s)", title, age, maxage);
      return;
    }

    try {
      const response = await fetchResource({
        resourceUrl,
        prevHeaders,
        force,
        timeout,
      });

      // Response headers are a Map - convert to plain object
      const headers = {};
      for (let [k, v] of response.headers) {
        headers[k] = v;
      }

      log.info(
        "Fetched feed (%s %s) %s",
        response.status,
        response.statusText,
        title
      );

      Object.assign(attrs, {
        lastValidated: timeStart,
        status: response.status,
        statusText: response.statusText,
        json: Object.assign(attrs.json, {
          headers,
          fetchDuration: Date.now() - timeStart,
        }),
      });

      if (response.status !== 200) {
        // This is most likely where we hit 304 Not Modified,
        // so skip parsing.
        log.info(
          "Skipping parse for feed (%s %s) %s",
          response.status,
          response.statusText,
          title
        );
      } else {
        const contentType = response.headers.get("content-type");
        const contentTypeParams = getParams(contentType || "");
        let charset = contentTypeParams.charset;

        if (!charset && attrs.json.charset) {
          // HACK: Try to guess a charset from previous parsing
          // Maybe we need to do a speculative parsing instead to
          // get XML encoding from doctype?
          let prevCharset = attrs.json.charset;
          if (!prevCharset) {
            prevCharset = attrs.json.meta["#xml"].encoding;
          }
          charset = prevCharset;
        }

        if (!charset) {
          charset = DEFAULT_FEED_CHARSET;
        }

        let bodyStream = response.body;
        if (charset && !/utf-*8/i.test(charset)) {
          const iconv = new Iconv(charset, "utf-8");
          log.debug(
            "Converting from charset %s to utf-8 for %s",
            charset,
            title
          );
          bodyStream = bodyStream.pipe(iconv);
        }

        const { meta, items } = await parseFeedStream(
          { stream: bodyStream, resourceUrl },
          context
        );

        Object.assign(attrs, {
          lastParsed: timeStart,
          json: Object.assign(attrs.json, {
            meta,
            charset,
            parseDuration: Date.now() - timeStart,
          }),
        });

        const FeedItem = require("./FeedItem");

        const existingGuids = new Set(
          await FeedItem.query()
            .where({ feed_id: this.id })
            .select("guid")
            .pluck("guid")
        );
        const newGuids = new Set();
        const seenGuids = new Set();

        let newestDate = null;
        for (let rawItem of items.slice(0, MAX_ITEMS_TO_IMPORT)) {
          const { isNew, item } = await FeedItem.importItem(
            this,
            rawItem,
            context,
            options
          );
          seenGuids.add(item.guid);
          if (isNew) {
            newGuids.add(item.guid);
          }
          if (newestDate === null || item.date > newestDate) {
            newestDate = item.date;
          }
        }

        if (newGuids.size > 0) {
          attrs.lastNewItem = newestDate || new Date().toISOString();
        }

        const defunctGuids = Array.from(existingGuids.values()).filter(
          (guid) => !seenGuids.has(guid)
        );

        // Update defunct and new flags for this feed's items
        // Do this in chunks, because some feeds yield hundreds of defunct
        const chunkSize = 10;
        for (let idx = 0; idx < defunctGuids.length; idx += chunkSize) {
          await FeedItem.query()
            .update({ defunct: true })
            .whereIn("guid", defunctGuids.slice(idx, idx + chunkSize));
        }

        log.info(
          "Parsed %s items (%s new / %s seen / %s defunct / %s existing) for feed %s",
          items.length,
          newGuids.size,
          seenGuids.size,
          defunctGuids.length,
          existingGuids.size,
          title
        );
      }
    } catch (err) {
      log.error("Feed poll failed for %s - %s", title, err, err.stack);

      Object.assign(attrs, {
        lastValidated: timeStart,
        lastError: err,
        json: Object.assign(attrs.json, {
          duration: Date.now() - timeStart,
        }),
      });
    }

    try {
      return this.$query().patch(attrs);
    } catch (err) {
      log.error("Feed update failed for %s - %s", title, err, err.stack);
    }
  }
}

function getParams(str) {
  var params = str.split(";").reduce(function (params, param) {
    var parts = param.split("=").map(function (part) {
      return part.trim();
    });
    if (parts.length === 2) {
      params[parts[0]] = parts[1];
    }
    return params;
  }, {});
  return params;
}

module.exports = Feed;

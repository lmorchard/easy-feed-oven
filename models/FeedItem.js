const { Model } = require("objection");
const guid = require("objection-guid")();
const crypto = require("crypto");
const cheerio = require("cheerio");
const { stripNullValues } = require("../lib");
const ThumbExtractor = require("../lib/thumb-extractor");
const BaseModel = require("./BaseModel");

class FeedItem extends guid(BaseModel) {
  static get tableName() {
    return "FeedItems";
  }

  static get relationMappings() {
    const Feed = require("./Feed");
    return {
      feed: {
        relation: Model.BelongsToOneRelation,
        modelClass: Feed,
        join: {
          from: "FeedItems.feed_id",
          to: "Feeds.id",
        },
      },
    };
  }

  static get uniqueAttributes() {
    return ["guid"];
  }

  static get virtualAttributes() {
    return ["html", "text"];
  }

  // TODO: move html & text virtuals into parsing?
  html() {
    // TODO: do some HTML sanitizing here
    return this.description || this.summary;
  }

  text() {
    try {
      const source = this.summary || this.description;
      if (!source) {
        return null;
      }
      const $ = cheerio.load(source);
      return $.text();
    } catch (e) {
      return null;
    }
  }

  static async queryWithParams({
    useNew = false,
    folder = false,
    feedId = null,
    after = null,
    before = null,
    limit = 10,
  }) {
    const applyParams = result => {
      if (after) {
        result = result.where("date", ">", after);
      }
      if (before) {
        result = result.where("date", "<", before);
      }
      if (feedId) {
        result = result.where({ feed_id: feedId });
      }
      if (useNew) {
        result = result.where({ new: true });
      }
      if (folder) {
        result = result.joinRelation("feed").where("feed.folder", folder);
      }
      return result;
    };

    const items = await applyParams(
      this.query()
        //.eager("feed")
        .orderBy("date", "DESC")
        .orderBy("id", "DESC")
        .limit(limit)
    );

    const { itemsCount } = await applyParams(
      this.query()
        .count("* as itemsCount")
        .first()
    );

    return { items, itemsRemaining: Math.max(0, itemsCount - limit) };
  }

  // TODO: flag in return value whether item exists / updated / new
  static async importItem(feed, item, context, options = {}) {
    const { log } = context;
    const { force = false } = options;

    const guid = itemGuid(item);
    const existingItem = await FeedItem.query()
      .where({ guid })
      .first();
    const isNew = !existingItem;
    if (!force && !isNew) {
      // Skip insert/update if there's an existing item and no force option
      // TODO: mind a max-age here?
      return {
        isNew,
        item: existingItem,
      };
    }

    const date = itemDate(item, existingItem);

    const {
      id: feed_id,
      title: feedTitle,
      data: feedData = {},
    } = stripNullValues(feed.toJSON());

    const {
      title = "",
      link = "",
      description = "",
      summary = "",
      author = "",
      ...json
    } = stripNullValues(item);

    if (isNew) {
      try {
        log.debug(
          "Start thumb extract for %s from %s %s",
          link,
          feedTitle,
          feed_id
        );
        const thumbUrl = await ThumbExtractor.fetch(link);
        json.thumbUrl = thumbUrl;
        log.debug(
          "Finish thumb extract for %s - %s from %s %s",
          link,
          thumbUrl,
          feedTitle,
          feed_id
        );
      } catch (e) {
        log.error(
          "Failed thumb extract for %s from %s %s %s",
          link,
          feedTitle,
          feed_id,
          e
        );
      }
    }

    return {
      isNew,
      item: await this.insertOrUpdate(
        {
          defunct: false,
          feed_id,
          guid,
          title,
          link,
          summary,
          date: date.toISOString(),
          json,
        },
        { log }
      ),
    };
  }

  static async purgeDefunct({ log }) {
    // TODO: Make maxDefunctAge configurable?
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const maxDefunctAge = new Date(Date.now() - THREE_DAYS).toISOString();

    const numDeleted = await this.query()
      .where("defunct", true)
      .where("date", "<", maxDefunctAge)
      .del();
    log.info("Purged %s defunct items", numDeleted);

    await this.knex().raw("vacuum");
    log.info("Vacuumed database.");

    return numDeleted;
  }
}

// Relevant date for an item has a bit of variance, so let's
// work with some fallbacks. Also, treat future dates as *now*,
// since I've seen a few feeds behave badly that way.
const itemDate = ({ date, pubdate }, { created_at } = {}) => {
  const now = new Date();
  const candidate = new Date(date || pubdate || created_at || now);
  return candidate < now ? candidate : now;
};

// Some items don't have a guid, so let's use a hash of the
// title & link as a rough fallback
const itemGuid = ({ guid, title = "", link = "" }) =>
  guid ||
  crypto
    .createHash("md5")
    .update(title)
    .update(link)
    .digest("hex");

module.exports = FeedItem;

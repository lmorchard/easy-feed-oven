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

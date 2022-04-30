export class FeedsIndex {
  static fetch(baseUrl) {
    return new FeedsIndex(baseUrl).fetch();
  }

  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.feeds = null;
  }

  async fetch() {
    const { baseUrl } = this;
    const response = await fetch(this.baseUrl);
    const data = await response.json();
    this.feeds = Object.entries(data).reduce(
      (acc, [id, indexData]) => ({
        ...acc,
        [id]: new Feed({ baseUrl, ...indexData }),
      }),
      {}
    );
    return this;
  }

  getFeedsUpdatedSince(since) {
    const sinceIso = since.toISOString();
    const feeds = Object.values(this.feeds)
      .filter((feed) => feed.itemsNewSince(sinceIso))
      .sort((a, b) => b.itemsNewestDate.localeCompare(a.itemsNewestDate));
    return feeds;
  }
}

export class Feed {
  constructor(indexData) {
    Object.assign(this, { ...indexData });
  }

  itemsNewSince(sinceIso) {
    return !!this.itemsNewestDate && this.itemsNewestDate > sinceIso;
  }

  async fetch() {

  }
}

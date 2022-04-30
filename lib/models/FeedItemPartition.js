import path from "path";
import {
  indexBy,
  writeJSONFile,
  readJSONFileIfExists,
} from "../misc.js";

import { FeedItem } from "./index.js";

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


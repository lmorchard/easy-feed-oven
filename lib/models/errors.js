export class BaseFeedError extends Error {
  get name() {
    return this.constructor.name;
  }
}
export class FetchError extends BaseFeedError {}
export class FeedParserError extends BaseFeedError {}
export class FeedNotFoundError extends BaseFeedError {}

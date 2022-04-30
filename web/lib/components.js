import { LitElement, css, html } from "lit";
import { FeedsIndex } from "./models.js";

export class FeedReaderElement extends LitElement {
  static properties = {
    base: {},
    feedsIndex: { type: Object },
  };

  constructor() {
    super();

    this.since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 1);
  }

  async willUpdate(changedProperties) {
    if (changedProperties.has("base")) {
      this.feedsIndex = await FeedsIndex.fetch(this.base);
    }
  }

  static styles = css``;

  render() {
    return html`
      <h1>easy-feed-oven</h1>
      <p>${this.since}</p>
      ${this.feedsIndex &&
      html`
        <ul>          
          ${this.feedsIndex
            .getFeedsUpdatedSince(this.since)
            .map((feed) => html`
              <li>
                <p>${feed.itemsNewestDate} - ${feed.title}</p>
              </li>
            `)}
        </ul>
      `}
    `;
  }
}

customElements.define("feed-reader", FeedReaderElement);

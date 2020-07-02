const { html, unescaped, urlencode } = require("../lib/html");
const { ONE_HOUR, THREE_HOURS } = require("../lib/times");

const page = ({ title = "Easy Feed Oven" }, content) => html`
  <!DOCTYPE html>
  <html lang="en-us">
    <head>
      <title>${title}</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="initial-scale=1" />
      <link rel="stylesheet" href="./index.css" />
    </head>
    <body>
      ${content}

      <script src="./vendor/timeago.min.js"></script>
      <script src="./index.js"></script>
    </body>
  </html>
`;

const allFeeds = ({ feeds }) =>
  page(
    {},
    html`
      <ul class="feeds">
        ${feeds.map(singleFeed)}
      </ul>
    `
  );

const singleFeed = (feed) => {
  const { link, htmlurl, title, pages, lastNewItem } = feed;
  const [firstPage] = pages;

  let feedHostname;
  try {
    const feedUrl = new URL(feed.link);
    feedHostname = feedUrl.hostname;
  } catch (e) {
    console.log("Bad feed link for", feed.title);
  }

  const shouldOpen =
    Date.now() - new Date(lastNewItem).getTime() <= THREE_HOURS;

  return html`
    <li class="feed">
      <details ${shouldOpen && "open"}>
        <summary>
          <span class="title">
            <img
              class="feedicon lazy-load"
              width="16"
              height="16"
              data-src="https://www.google.com/s2/favicons?domain=${feedHostname}"
            />
            <span class="feedtitle">${title}</span>
            <span class="feeddate timeago" datetime="${lastNewItem}"
              >${lastNewItem}</span
            >
          </span>
        </summary>
        <ul class="feeditems">
          <li class="next-feed-page">
            <a
              class="load-href lazy-load load-when-visible"
              href="${firstPage.thisPage}"
              >Load ${title}...</a
            >
          </li>
        </ul>
      </details>
    </li>
  `;
};
// <a class="feedlink" href="${link}" target="_blank">${title}</a>
// ${firstPage && feedPage(firstPage)}

const feedPage = ({
  feed,
  page: { items, nextPage, nextPageCount, nextPageTime },
}) => {
  return html`
    ${items && items.map(feedItem)}
    ${nextPage &&
    html`
      <li class="next-feed-page">
        <a class="load-href" href="${nextPage}"
          >${nextPageCount} more since
          <span class="timeago" datetime="${nextPageTime}"
            >${nextPageTime}</span
          >
          from ${feed.title}...</a
        >
      </li>
    `}
  `;
};

const feedItem = (item) => {
  const { link, title, summary, date, text, json } = item;
  const { thumbUrl } = json;
  //const text = item.text();
  return html`
    <li class="feeditem">
      ${thumbUrl &&
      html`<a target="_blank" class="thumb" href=${link}
        ><img class="lazy-load" data-src="${thumbUrl}"
      /></a>`}
      <div class="details">
        ${title &&
        html`<a class="title" target="_blank" href=${link}>${title}</a>`}
        ${text &&
        html`
          <span class="text">
            ${text.length < 160 ? text : text.substr(0, 160) + "[...]"}
          </span>
        `}
      </div>
      <div class="date">
        <a
          class="datelink timeago"
          datetime="${date}"
          target="_blank"
          href=${link}
          >${date}</a
        >
      </div>
    </li>
  `;
};

module.exports = {
  page,
  allFeeds,
  feedPage,
};

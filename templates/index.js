const { html, unescaped, urlencode } = require("../lib/html");

const page = ({ title = "Easy Feed Oven" }, content) => html`
  <!DOCTYPE html>
  <html lang="en-us">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style type="text/css">
        .feeds {
          margin: 0;
          padding: 0;        
        }

        .feeds .feed {
          list-style-type: none;        
          margin-bottom: 1em;
        }

        .feeditems {
          margin: 0;
          padding: 0;
          margin-top: 1em;
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .feeditems .feeditem {
          border: 1px solid #aaa;
          padding: 1em;
          margin-right: 1em;
          margin-bottom: 1em;
          list-style-type: none;
          flex-basis: 14%;    
        }

        .feeditem .title {
          display: block;
        }

        .feeditem .text {
          display: block;
        }
      </style>
    </head>
    <body>
      ${content}
    </body>
  </html>
`;

const allFeeds = ({ feeds }) =>
  page(
    {},
    html`
      <h1>Feeds</h1>
      <ul class="feeds">
        ${feeds.map(singleFeed)}
      </ul>
    `
  );

const singleFeed = (feed) => {
  const { link, htmlurl, title, items, lastNewItem } = feed;
  let feedHostname;
  try {
    const feedUrl = new URL(feed.link);
    feedHostname = feedUrl.hostname;
  } catch (e) {
    console.log("Bad feed link for", feed.title);
  }
  return html`
    <li class="feed">
      <span class="title">
        <img class="feedicon" width=16 height=16
          src=${`https://www.google.com/s2/favicons?domain=${feedHostname}`} />
        <a class="feedlink" href="${link}">${title}</a>
        <span class="feeddate">${lastNewItem}</span>
      </span>
      <ul class="feeditems">
        ${items && items.map(feedItem)}
      </ul>
    </li>
  `;
};

const feedItem = (item) => {
  const { link, title, summary, date, thumbUrl } = item;
  const text = item.text();
  return html`
    <li class="feeditem" style="background-image: url(${thumbUrl})">
      <div class="details">
        ${title && html`<a class="title" href=${link}>${title}</a>`}
        ${text &&
        html`
          <span class="text">
            ${text.length < 160 ? text : text.substr(0, 160) + "[...]"}
          </span>
        `}
        ${thumbUrl}
      </div>
      <div class="date">
        <a class="datelink" href=${link}>${date}</a>
      </div>
    </li>
  `;
};

module.exports = {
  page,
  allFeeds,
};

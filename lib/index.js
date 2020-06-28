const config = require("./config");
const defaultLog = require("./log")(__filename);

const FeedParser = require("feedparser");
const OpmlParser = require("opmlparser");
const stream = require("stream");
const AbortController = require("abort-controller");
const fetch = require("node-fetch");

function mapFn(names, fn) {
  return names.reduce(
    (acc, name) => ({
      ...acc,
      [name]: fn(name),
    }),
    {}
  );
}

const stripNullValues = (obj) => {
  const out = Object.assign({}, obj);
  const nullKeys = Object.keys(obj).filter((key) => obj[key] === null);
  for (let key of nullKeys) {
    delete out[key];
  }
  return out;
};

function indexBy(items, keyFn) {
  const index = {};
  for (const item of items) {
    const key = keyFn(item);
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      if (k) index[k] = [...(index[k] || []), item];
    }
  }
  return index;
}

// https://stackoverflow.com/a/48032528
async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

const all = Promise.all.bind(Promise);

const mapAll = (list, fn) => all(list.map(fn));

const pluck = (spec) => (data) => {
  const out = {};
  Object.keys(spec).forEach((name) => {
    const mapper = spec[name];
    out[name] = typeof mapper === "string" ? data[mapper] : mapper(data);
  });
  return out;
};

const params = (params) =>
  Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");

async function fetchResource({
  resourceUrl,
  prevHeaders = {},
  timeout = config.fetchTimout,
  userAgent = config.userAgent,
  force = false,
  accept = "application/rss+xml, text/rss+xml, text/xml",
  log = defaultLog,
}) {
  const fetchOptions = {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept,
    },
  };

  // Set up an abort timeout - we're not waiting forever for a feed
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), parseInt(timeout));
  fetchOptions.signal = controller.signal;

  // Set up some headers for conditional GET so we can see
  // some of those sweet 304 Not Modified responses
  if (!force) {
    if (prevHeaders.etag) {
      fetchOptions.headers["If-None-Match"] = prevHeaders.etag;
    }
    if (prevHeaders["last-modified"]) {
      fetchOptions.headers["If-Modified-Match"] = prevHeaders["last-modified"];
    }
  }

  try {
    // Finally, fire off the GET request for the feed resource.
    const response = await fetch(resourceUrl, fetchOptions);
    clearTimeout(abortTimeout);
    return response;
  } catch (err) {
    clearTimeout(abortTimeout);
    throw err;
  }
}

const parseOpmlStream = ({ stream, log = defaultLog }) =>
  new Promise((resolve, reject) => {
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

const parseFeedStream = ({ stream, resourceUrl, log = defaultLog }) =>
  new Promise((resolve, reject) => {
    let meta;
    const items = [];

    const parser = new FeedParser({
      addmeta: false,
      feedurl: resourceUrl,
    });

    parser.on("error", reject);
    parser.on("end", () => resolve({ meta, items }));
    parser.on("readable", function () {
      meta = this.meta;
      let item;
      while ((item = this.read())) {
        items.push(item);
      }
    });

    stream.pipe(parser);
  });

module.exports = {
  mapFn,
  stripNullValues,
  indexBy,
  replaceAsync,
  all,
  mapAll,
  params,
  pluck,
  fetchResource,
  parseFeedStream,
  parseOpmlStream,
};

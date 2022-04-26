import stream from "stream";
import FeedParser from "feedparser";
import OpmlParser from "opmlparser";

import config from "../lib/config.js";

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

export const parseOpmlStream = ({ stream }) =>
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

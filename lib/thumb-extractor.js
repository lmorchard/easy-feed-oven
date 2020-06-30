// # Thumb Extractor
//
// Handy for extracting thumbs from the web.
//
// Based on ancient code from
// https://github.com/lmorchard/thumb-extractor

const config = require("./config");
var url = require("url");
var util = require("util");
var cheerio = require("cheerio");
const _fetch = require("node-fetch");
const AbortController = require("abort-controller");

// TODO: Move these constants into config
var REJECTED_URLS = [
  "http://graphics8.nytimes.com/images/common/icons/t_wb_75.gif",
  "https://s0.wp.com/i/blank.jpg",
  "https://www.techmeme.com/img/techmeme_sq328.png",
  "https://www.arcade-museum.com/images/klov_big_logo_crop_250_20PerEdge.jpg",  
];
var REJECTED_RES = [".*doubleclick.net.*", ".*indieclick.com.*", ".*blank.jpg.*"];

const TIMEOUT = 1000;

var _cache = {};

// ## fetch
async function fetch(url, timeout = TIMEOUT) {
  if (url in _cache) {
    return _cache[url][0];
  }
  const controller = new AbortController();
  const abortTimeout = setTimeout(
    () => controller.abort(),
    parseInt(timeout)
  );
  const response = await _fetch(url, {
    method: "GET",
    headers: {
      "user-agent": config.userAgent,
    },
    signal: controller.signal,
  });
  clearTimeout(abortTimeout);
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("text/html")) {
    return find(url, "");
  }
  return find(url, body);
}

// ## accept
// Consider accepting a thumb URL. Match against reject list. Resolve relative
// URLs to absolute with respect to base URL.
function accept(base_url, thumb_url) {
  // Bail, if there's no URL.
  if (!thumb_url) {
    return null;
  }
  // Check rejected URLs
  for (var i = 0, reject_url; (reject_url = REJECTED_URLS[i]); i++) {
    if (thumb_url == reject_url) {
      return null;
    }
  }
  // Check rejected regexes
  for (var i = 0, reject_re; (reject_re = REJECTED_RES[i]); i++) {
    var r = new RegExp(reject_re);
    if (r.test(thumb_url)) {
      return null;
    }
  }
  // Resolve any relative URLs to the fetched base URL.
  thumb_url = url.resolve(base_url, thumb_url);
  return thumb_url;
}

// ## find
function find(base_url, body) {
  if (base_url in _cache) {
    return _cache[base_url][0];
  }

  var next = function (err, url, kind) {
    _cache[base_url] = [url, kind];
    return url;
  };

  var $ = cheerio.load(body);
  var meta, thumb_url;

  // Open Graph image
  thumb_url = accept(
    base_url,
    $('meta[property="og:image"]').first().attr("content")
  );
  if (thumb_url) return next(null, thumb_url, "meta_og_image");

  // Twitter thumbnail
  thumb_url = accept(
    base_url,
    $('meta[name="twitter:image"]').first().attr("value")
  );
  if (thumb_url) return next(null, thumb_url, "link_twitter_image");

  // Old-school Facebook thumbnail convention
  thumb_url = accept(base_url, $('link[rel="image_src"]').first().attr("href"));
  if (thumb_url) return next(null, thumb_url, "meta_image_src");

  // Try looking for the largest image in a number of common containers
  var containers = [
    "article",
    ".content",
    ".entry",
    ".postContainer",
    "#article .first .image", // NYT?
    "#comic",
    ".comic",
    "#main-content",
    null, // Last-ditch, try all images everywhere
  ];

  for (let sel of containers) {
    // Assemble the selector, gather images.
    var imgs = $(sel ? sel + " img" : "img");
    if (!imgs.length) {
      continue;
    }

    // Assemble image areas, where available.
    var areas = [];
    imgs.each((img) => {
      img = $(img);
      // TODO: Use something to discover real dimensions?
      var width = img.attr("width") || 0;
      var height = img.attr("height") || 0;
      areas.push([width * height, img]);
    });

    // If we got any areas, sort them and use the largest.
    if (areas.length) {
      areas.sort((a, b) => b[0] - a[0]);
      for (let area of areas) {
        thumb_url = accept(base_url, area[1].attr("src"));
        if (thumb_url) return next(null, thumb_url, "largest");
      }
    }
  }

  return next(null, null, "notfound");
}

module.exports = {
  _cache,
  find,
  fetch,
};

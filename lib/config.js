require("dotenv").config();

const path = require("path");
const convict = require("convict");

const config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV",
  },
  logLevel: {
    doc: "Log level",
    format: ["fatal", "error", "warn", "info", "debug", "trace", "silent"],
    default: "info",
    env: "LOG_LEVEL",
  },
  logName: {
    doc: "Log base name",
    format: String,
    default: "easy-feed-oven",
    env: "LOG_NAME",
  },
  userAgent: {
    doc: "User-Agent header used during fetches",
    format: String,
    default:
      "easy-feed-oven/1.0 (+https://github.com/lmorchard/easy-feed-oven)",
    env: "USER_AGENT",
  },
  fetchTimout: {
    doc: "Default timeout in ms for feed fetches",
    format: "nat",
    default: 10000,
    env: "TIMEOUT",
  },
  buildPath: {
    doc: "Path at which to build the static site",
    format: String,
    default: path.join(__dirname, "..", "build"),
    env: "BUILD_PATH",
  },
  dataPath: {
    doc: "Path at which to store data from feeds",
    format: String,
    default: path.join(__dirname, "..", "data"),
    env: "DATA_PATH",
  },
  feedPollConcurrency: {
    doc: "Feed poll queue concurrency",
    format: "nat",
    default: 10,
    env: "FEED_POLL_CONCURRENCY",
  }
});

try {
  // Load environment dependent configuration
  config.loadFile(`./config/${config.get("env")}.json`);
} catch (err) {
  // no-op
}

config.validate();

module.exports = config.getProperties();

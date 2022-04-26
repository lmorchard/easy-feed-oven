const path = require("path");
const config = require("./config");
const logger = require("pino")({
  name: config.logName,
  level: config.logLevel,
});

module.exports = (filename) => {
  if (typeof filename === 'undefined') {
    return logger;
  }
  const name = filename.replace(`${path.dirname(__dirname)}/`, "");
  return logger.child({ name: `${config.logName}:${name}` });
};

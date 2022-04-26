import pino from "pino";
import config from "./config.js";

const logger = pino({
  name: config.logName,
  level: config.logLevel,
});

export default function (name) {
  return logger.child({ name: `${config.logName}:${name}` });
}

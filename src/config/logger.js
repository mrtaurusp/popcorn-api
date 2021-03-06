// Import the neccesary modules.
import expressWinston from "express-winston";
import fs from "fs";
import sprintf from "sprintf";
import winston from "winston";
import { global } from "./global";
import packageJSON from "../../package.json";

/**
 * @class
 * @classdesc The factory function for overriding the default console object.
 * @memberof module:config/logger
 * @property {Object} logger - The Winston instance.
 * @property {Object} expressLogger - The Express Winston instance.
 * @param {Console} console - The default console object.
 */
const Logger = console => {

  // Create the temp directory if it does not exists.
  if (!fs.existsSync(global.tempDir)) fs.mkdirSync(global.tempDir);

  /**
   * @description Check if the message is empty and replace it with the meta.
   * @function Logger#checkEmptyMessage
   * @memberof module:config/logger
   * @param {Object} args - Arguments passed by Winston.
   * @returns {Object} - Formatter arguments passed by Winston.
   */
  const checkEmptyMessage = args => {
    if (args.message === "" && Object.keys(args.meta).length !== 0)
      args.message = JSON.stringify(args.meta);

    return args;
  };

  /**
   * @description Formatter function which formats the output to the console.
   * @function Logger#consoleFormatter
   * @memberof module:config/logger
   * @param {Object} args - Arguments passed by Winston.
   * @returns {String} - The formatted message.
   */
  const consoleFormatter = args => {
    let levelColor = "";
    switch (args.level) {
    case "error":
      levelColor = "\x1b[31m";
      break;
    case "warn":
      levelColor = "\x1b[33m";
      break;
    case "info":
      levelColor = "\x1b[36m";
      break;
    case "debug":
      levelColor = "\x1b[34m";
      break;
    default:
      levelColor = "\x1b[36m";
      break;
    }

    args = checkEmptyMessage(args);
    return sprintf(`\x1b[0m[%s] ${levelColor}%5s:\x1b[0m %2s/%d: \x1b[36m%s\x1b[0m`,
      new Date().toISOString(), args.level.toUpperCase(), packageJSON.name,
      process.pid, args.message);
  };

  /**
   * @description Formatter function which formate the output to the log file.
   * @function Logger#fileFormatter
   * @memberof module:config/logger
   * @param {Object} args - Arguments passed by Winston.
   * @returns {String} - The formatted message.
   */
  const fileFormatter = args => {
    args = checkEmptyMessage(args);
    return JSON.stringify({
      name: packageJSON.name,
      pid: process.pid,
      level: args.level,
      msg: args.message,
      time: new Date().toISOString()
    });
  };

  const logger = new winston.Logger({
    transports: [
      new winston.transports.Console({
        name: packageJSON.name,
        formatter: consoleFormatter,
        handleExceptions: true,
        prettyPrint: true
      }),
      new winston.transports.File({
        filename: `${global.tempDir}/${packageJSON.name}.log`,
        level: "warn",
        json: false,
        formatter: fileFormatter,
        maxsize: 5242880,
        handleExceptions: true
      })
    ],
    exitOnError: false
  });

  const expressLogger = new expressWinston.logger({winstonInstance: logger, expressFormat: true});

  // Override the console functions.
  console.log = msg => logger.info(msg);
  console.error = msg => logger.error(msg);
  console.warn = msg => logger.warn(msg);
  console.info = msg => logger.info(msg);
  console.debug = msg => logger.debug(msg);

  /**
   * @description Reset the default log file.
   * @function Logger#reset
   * @memberof module:config/logger
   */
  const reset = () => {
    if (fs.existsSync(`${global.tempDir}/${packageJSON.name}.log`))
      fs.unlinkSync(`${global.tempDir}/${packageJSON.name}.log`);
  };

  // Return the public functions.
  return { expressLogger, logger, reset };

};

// Export the Routes factory function.
export default Logger;

// 2018-07-21: AA; A very basic logging setup ... Not particularly attached to
// this library or this way of doing things, but this still beats console
// outputs.

import winston_pkg from 'winston';
const { createLogger, format, transports } = winston_pkg
const { combine, timestamp, label, printf } = format;
import { isColorEnabled } from './colorConfig.mjs';

const myFormat = printf(info => {
  return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});

export type Logger = {
  info:  (msg: string) => void;
  debug: (msg: string) => void;
  error: (msg: string) => void;
};

export type LoggerLevel = "info" | "debug" | "error";

export function mkLogger (lbl: string, level : LoggerLevel = "info")
  : Logger
{
  // Conditionally include colorize based on color configuration
  const formatList = [
    label({ label: `${lbl}` }),
    timestamp(),
    myFormat
  ];

  if (isColorEnabled()) {
    formatList.unshift(format.colorize());
  }

  return createLogger({
    level : level, // comment out this file to remove debug messages
    format: combine(...formatList),
    transports: [new transports.Console()]
  });
}

import crypto from "crypto";

import cookieParser from "cookie-parser";
import express from "express";
import { initialize } from "express-openapi";
import slowDown from "express-slow-down";
import qs from "qs";

import { apiKeyCheck } from "./auth/apiKey";
import "./auth/passport";
import logger from "./logger";
import rateLimiter from "./rateLimiter";
import apiDoc from "./routers/v1/api-doc";
import routes from "./routes";
import { dedupeQueryParams } from "./utils/dedupeQueryParams";
import errorHandler from "./utils/error";
import {
  sanitizeHeadersForLogs,
  sanitizeBodyForLogs,
} from "./utils/requestLogging";
import { registerRouteParamResolvers } from "./utils/routeParams";
import { stripNullBytesFromObject } from "./utils/sanitize";
const isDev = process.env.NODE_ENV === "development";

const apiApp = express();
apiApp.set("query parser", (str: string) => qs.parse(str));

// Add request ID to each request for tracing
apiApp.use((req, res, next) => {
  const requestId = crypto.randomBytes(8).toString("hex");
  // @ts-ignore
  req.requestId = requestId;
  // @ts-ignore - Create child logger with request ID
  req.logger = logger.child({ requestId });
  next();
});

apiApp.use(apiKeyCheck);
apiApp.use(cookieParser());
apiApp.use(express.urlencoded({ extended: true }));

apiApp.use(
  express.json({
    limit: "5mb",
    type: ["application/*+json", "application/json"],
    verify: (req, res, buf) => {
      // See https://stackoverflow.com/a/70951912/154392
      // @ts-ignore
      req.rawBody = buf.toString();
    },
  })
);

// PostgreSQL text fields reject null bytes. Strip them from all incoming
// JSON bodies so audio metadata (ID3 tags often contain \0 padding)
// and other user input can never cause a 22P05 error.
apiApp.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = stripNullBytesFromObject(req.body);
  }
  next();
});

apiApp.use((req, res, next) => {
  if (isDev) {
    next();
    return;
  }
  // @ts-ignore - Create child logger with request ID
  const log = req.logger || logger;
  // Basic logging for API requests
  const sanitizedHeaders = sanitizeHeadersForLogs(req.headers);
  const sanitizedBody = sanitizeBodyForLogs(req.body);
  log.info(
    `API: ${req.method} ${req.path} - query: ${JSON.stringify(req.query)} - body: ${JSON.stringify(sanitizedBody)} - headers: ${JSON.stringify(sanitizedHeaders)}`
  );
  next();
});

apiApp.use(rateLimiter);
apiApp.use(
  slowDown({
    windowMs: 60 * 1000, // 1 minute
    delayAfter: 20, // allow 20 requests per minute, then start slowing down
    delayMs: () => 500, // add 500ms delay per request after the first
  })
);

// Some oEmbed consumers send `url`/`format` more than once in the query
// string, which fails schema validation since those params are declared as
// single strings. Collapse duplicates to their first value before the
// validator sees them.
apiApp.use("/oembed", dedupeQueryParams(["url", "format"]));

// Must be registered before initialize() so express attaches the param
// hooks to the routes express-openapi creates.
registerRouteParamResolvers(apiApp);

initialize({
  app: apiApp,
  apiDoc,
  // FIXME: it looks like express-openapi doesn't handle
  // typescript files very well.
  // https://github.com/kogosoftwarellc/open-api/issues/838
  // paths: "./src/routers/v1",
  // routesGlob: "**/*.{ts,js}",
  // routesIndexFileRegExp: /(?:index)?\.[tj]s$/,
  paths: routes.map((r) => ({
    path: "/" + r,
    module: require(`./routers/v1/${r}`),
  })),

  errorMiddleware: errorHandler,
});

export default apiApp;

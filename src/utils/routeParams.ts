import { Express } from "express";

import { findProfileIdForURLSlug } from "./artist";

/**
 * Resolves id-or-slug route params once, before the handler, and puts the
 * numeric id on `res.locals` under the same name as the param (#1141).
 *
 * A slug that matches nothing 404s here, since no handler could succeed
 * without the id. Numeric ids pass through unchecked: existence and
 * permission checks vary per route, so handlers keep their own.
 */
export const registerRouteParamResolvers = (app: Express) => {
  app.param("artistId", async (req, res, next, value) => {
    try {
      const artistId = await findProfileIdForURLSlug(value);
      if (artistId === undefined) {
        return res.status(404).json({ error: "Artist not found" });
      }
      res.locals.artistId = artistId;
      next();
    } catch (e) {
      next(e);
    }
  });
};

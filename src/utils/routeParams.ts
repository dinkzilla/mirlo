import { Express } from "express";

import { findProfileIdForURLSlug } from "./artist";

/**
 * Resolves the id-or-slug `{profileId}` route param once, before the
 * handler, and puts the numeric id on `res.locals.profileId` (#1141).
 *
 * A slug that matches nothing 404s here, since no handler could succeed
 * without the id. Numeric ids pass through unchecked: existence and
 * permission checks vary per route, so handlers keep their own.
 */
export const registerRouteParamResolvers = (app: Express) => {
  app.param("profileId", async (req, res, next, value) => {
    try {
      const profileId = await findProfileIdForURLSlug(value);
      if (profileId === undefined) {
        return res.status(404).json({ error: "Artist not found" });
      }
      res.locals.profileId = profileId;
      next();
    } catch (e) {
      next(e);
    }
  });
};

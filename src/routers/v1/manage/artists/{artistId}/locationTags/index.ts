import { NextFunction, Request, Response } from "express";
import prisma from "@mirlo/prisma";
import {
  userAuthenticated,
  profileBelongsToLoggedInUser,
} from "../../../../../../auth/passport";
import { AppError } from "../../../../../../utils/error";

export default function () {
  const operations = {
    GET: [userAuthenticated, profileBelongsToLoggedInUser, GET],
    POST: [userAuthenticated, profileBelongsToLoggedInUser, POST],
  };

  async function GET(req: Request, res: Response, next: NextFunction) {
    try {
      const profileId = res.locals.artistId as number;

      const locationTags = await prisma.profileLocationTag.findMany({
        where: { profileId: profileId },
        include: { locationTag: true },
      });

      const tags = locationTags.map((alt) => alt.locationTag);
      res.json(tags);
    } catch (error) {
      next(error);
    }
  }

  GET.apiDoc = {
    summary: "Get location tags for an artist",
    tags: ["Artists", "Location Tags"],
    parameters: [
      {
        in: "path",
        name: "artistId",
        required: true,
        type: "string",
        description: "Artist ID or urlSlug",
      },
    ],
    responses: {
      200: {
        description: "List of location tags for the artist",
        schema: {
          type: "array",
          items: {
            type: "object",
          },
        },
      },
    },
  };

  async function POST(req: Request, res: Response, next: NextFunction) {
    try {
      const profileId = res.locals.artistId as number;
      const { locationTagId } = req.body;

      if (!locationTagId) {
        throw new AppError({
          httpCode: 400,
          description: "locationTagId is required",
        });
      }

      // Verify location tag exists
      const locationTag = await prisma.locationTag.findUnique({
        where: { id: locationTagId },
      });
      if (!locationTag) {
        throw new AppError({
          httpCode: 404,
          description: "Location tag not found",
        });
      }

      // Create or ignore if already exists
      const result = await prisma.profileLocationTag.upsert({
        where: {
          profileId_locationTagId: { profileId: profileId, locationTagId },
        },
        create: { profileId: profileId, locationTagId },
        update: {},
        include: { locationTag: true },
      });

      res.json(result.locationTag);
    } catch (error) {
      next(error);
    }
  }

  POST.apiDoc = {
    summary: "Add a location tag to an artist",
    tags: ["Artists", "Location Tags"],
    parameters: [
      {
        in: "path",
        name: "artistId",
        required: true,
        type: "string",
        description: "Artist ID or urlSlug",
      },
      {
        in: "body",
        name: "body",
        required: true,
        schema: {
          type: "object",
          required: ["locationTagId"],
          properties: {
            locationTagId: {
              type: "integer",
              description: "Location tag ID",
            },
          },
        },
      },
    ],
    responses: {
      200: {
        description: "Location tag added to artist",
        schema: {
          type: "object",
        },
      },
    },
  };

  return operations;
}

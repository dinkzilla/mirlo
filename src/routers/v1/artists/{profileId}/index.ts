import prisma from "@mirlo/prisma";
import { NextFunction, Request, Response } from "express";

import { userLoggedInWithoutRedirect } from "../../../../auth/passport";
import { serializeProfile } from "../../../../serializers/artist";
import {
  checkIsUserSubscriber,
  singleInclude,
  whereForAllProfilesThisLabelCanEdit,
  whereForVisibleProfile,
} from "../../../../utils/artist";

export default function () {
  const operations = {
    GET: [userLoggedInWithoutRedirect, GET],
  };

  async function GET(req: Request, res: Response, next: NextFunction) {
    const profileId = res.locals.profileId as number;
    const { includeDefaultTier: includeDefaultTierStr } = req.query as {
      includeDefaultTier?: string;
    };
    const includeDefaultTier = includeDefaultTierStr === "true";
    const loggedInUser = req.user;
    try {
      const canManage =
        !!loggedInUser &&
        (await prisma.profile.findFirst({
          where: {
            id: profileId,
            enabled: true,
            ...whereForAllProfilesThisLabelCanEdit(loggedInUser.id),
          },
          select: { id: true },
        })) !== null;

      const profile = await prisma.profile.findFirst({
        where: {
          id: profileId,
          ...(loggedInUser?.isAdmin ? {} : whereForVisibleProfile()),
        },
        include: singleInclude({
          includeDefaultTier,
          includePrivate: canManage,
        }) as any,
      });

      if (!profile) {
        return res.status(404).json({ error: "Artist not found" });
      }

      const isUserSubscriber = await checkIsUserSubscriber(
        loggedInUser,
        profileId
      );

      return res.json({
        result: serializeProfile(
          profile as any,
          loggedInUser?.id,
          isUserSubscriber
        ),
      });
    } catch (e) {
      next(e);
    }
  }

  GET.apiDoc = {
    summary: "Returns Artist information",
    parameters: [
      {
        in: "path",
        name: "profileId",
        required: true,
        type: "string",
        description: "Artist ID or urlSlug",
      },
      {
        in: "query",
        name: "includeDefaultTier",
        required: false,
        type: "string",
        enum: ["true", "false"],
        description:
          "Include the default (free) subscription tier in subscriptionTiers. Defaults to false.",
      },
    ],
    responses: {
      200: {
        description:
          "An artist matching the id, including trackGroups, merch, and subscriptionTiers",
        schema: {
          $ref: "#/definitions/Artist",
        },
      },
      404: {
        description: "Artist not found",
      },
      default: {
        description: "An error occurred",
        schema: {
          additionalProperties: true,
        },
      },
    },
  };
  return operations;
}

import prisma from "@mirlo/prisma";
import { NextFunction, Request, Response } from "express";

import { assertLoggedIn } from "../../../../../../auth/getLoggedInUser";
import {
  artistBelongsToLoggedInUser,
  canUserCreateArtists,
  userAuthenticated,
} from "../../../../../../auth/passport";
import { serializeProfileSubscriptionTier } from "../../../../../../serializers/profileSubscriptionTier";
import { getPlatformFeeForArtist } from "../../../../../../utils/artist";

export default function () {
  const operations = {
    GET: [
      userAuthenticated,
      canUserCreateArtists,
      artistBelongsToLoggedInUser,
      GET,
    ],
    POST: [
      userAuthenticated,
      canUserCreateArtists,
      artistBelongsToLoggedInUser,
      POST,
    ],
  };

  async function GET(req: Request, res: Response, next: NextFunction) {
    const profileId = res.locals.profileId as number;
    const { includeDefault } = req.query as { includeDefault?: boolean };

    try {
      const subscriptions = await prisma.profileSubscriptionTier.findMany({
        where: {
          profileId: profileId,
          ...(includeDefault ? {} : { isDefaultTier: false }),
        },
        orderBy: {
          minAmount: "asc",
        },
        include: {
          images: {
            include: { image: true },
          },
          releases: {
            where: {
              trackGroup: {
                deletedAt: null,
              },
            },
            include: {
              trackGroup: {
                include: {
                  cover: true,
                  profile: true,
                },
              },
            },
          },
        },
      });

      res.status(200).json({
        results: subscriptions.map((s) => serializeProfileSubscriptionTier(s)),
      });
    } catch (e) {
      next(e);
    }
  }

  async function POST(req: Request, res: Response) {
    const profileId = res.locals.profileId as number;
    assertLoggedIn(req);
    const user = req.user;

    try {
      const {
        name,
        description,
        minAmount,
        maxAmount,
        interval,
        collectAddress,
        allowVariable,
        defaultAmount,
        autoPurchaseAlbums,
        digitalDiscountPercent,
        merchDiscountPercent,
        imageId,
      } = req.body;
      const subscription = await prisma.profileSubscriptionTier.create({
        data: {
          name,
          profileId: profileId,
          description,
          minAmount,
          collectAddress,
          maxAmount,
          interval,
          autoPurchaseAlbums,
          platformPercent: await getPlatformFeeForArtist(profileId),
          allowVariable,
          defaultAmount,
          digitalDiscountPercent,
          merchDiscountPercent,
        },
      });
      if (imageId) {
        await prisma.subscriptionTierImage.deleteMany({
          where: {
            tierId: subscription.id,
          },
        });
        await prisma.subscriptionTierImage.create({
          data: {
            imageId: imageId,
            tierId: subscription.id,
          },
        });
      }
      res.json({
        result: serializeProfileSubscriptionTier(subscription),
      });
    } catch (e) {
      res.status(500).json({
        error:
          "Something went wrong while trying to create a artistSubscriptionTier",
      });
    }
  }

  POST.apiDoc = {
    summary: "Creates a artistSubscriptionTier belonging to a user",
    parameters: [
      {
        in: "body",
        name: "subscription",
        schema: {
          $ref: "#/definitions/ArtistSubscriptionTierCreate",
        },
      },
    ],
    responses: {
      200: {
        description: "Created artistSubscriptionTier",
        schema: {
          $ref: "#/definitions/ArtistSubscriptionTierResult",
        },
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

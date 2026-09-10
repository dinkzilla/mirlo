import prisma from "@mirlo/prisma";
import { NextFunction, Request, Response } from "express";

import { userLoggedInWithoutRedirect } from "../../../../auth/passport";
import { AppError } from "../../../../utils/error";

export default function () {
  const operations = {
    POST: [userLoggedInWithoutRedirect, POST],
  };

  async function POST(req: Request, res: Response, next: NextFunction) {
    const profileId = res.locals.artistId as number;
    const user = req.user;
    const { email } = req.body ?? {};

    try {
      let userIdToRemove: number | undefined = user?.id;
      if (!userIdToRemove && email && typeof email === "string") {
        const relevantUser = await prisma.user.findFirst({
          where: {
            email,
          },
          select: {
            id: true,
          },
        });
        userIdToRemove = relevantUser?.id;
      }

      if (userIdToRemove) {
        const profile = await prisma.profile.findFirst({
          where: {
            id: profileId,
          },
          include: {
            subscriptionTiers: true,
          },
        });

        if (profile) {
          // Free follows (the default tier) have no payment behind them, so
          // "unfollow" removes them outright. Paid subscriptions keep billing
          // and access untouched — this endpoint only turns off the emails,
          // since that's all a "stop receiving emails" link should do.
          await prisma.profileUserSubscription.deleteMany({
            where: {
              profileSubscriptionTier: {
                profileId: profile.id,
                isDefaultTier: true,
              },
              userId: userIdToRemove,
            },
          });
          await prisma.profileUserSubscription.updateMany({
            where: {
              profileSubscriptionTier: {
                profileId: profile.id,
                isDefaultTier: false,
              },
              userId: userIdToRemove,
            },
            data: { receiveEmail: false },
          });

          res.status(200).json({
            message: "success",
          });
        } else {
          throw new AppError({
            httpCode: 404,
            description: "Artist not found",
          });
        }
      } else {
        throw new AppError({
          httpCode: 404,
          description: "User not found",
        });
      }
    } catch (e) {
      next(e);
    }
  }

  POST.apiDoc = {
    summary: "Unfollows a user to an artist",
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
        description: "Removed artistSubscriptionTier",
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

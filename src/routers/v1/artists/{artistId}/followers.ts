import prisma from "@mirlo/prisma";
import { Request, Response } from "express";

export default function () {
  const operations = {
    GET: [GET],
  };

  async function GET(req: Request, res: Response) {
    const artistId = res.locals.artistId as number;

    try {
      const profile = await prisma.profile.findFirst({
        where: {
          id: artistId,
        },
        include: {
          subscriptionTiers: true,
        },
      });

      if (!profile) {
        return res.status(404).json({
          error: "Artist not found",
        });
      }

      const followers = await prisma.profileUserSubscription.findMany({
        where: {
          profileSubscriptionTier: {
            profileId: artistId,
          },
        },
      });
      res.json({
        result: followers.length,
      });
    } catch (e) {
      console.error(`/v1/artists/{artistId}/followers ${e}`);
      res.status(400);
    }
  }

  GET.apiDoc = {
    summary: "Returns followers",
    responses: {
      200: {
        description: "A list of followers",
        schema: {
          type: "array",
          items: {
            $ref: "#/definitions/Post",
          },
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

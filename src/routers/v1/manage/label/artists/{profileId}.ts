import { NextFunction, Request, Response } from "express";

import prisma from "@mirlo/prisma";
import { userAuthenticated } from "../../../../../auth/passport";
import { assertLoggedIn } from "../../../../../auth/getLoggedInUser";
import { AppError } from "../../../../../utils/error";

export default function () {
  const operations = {
    PUT: [userAuthenticated, PUT],
  };
  async function PUT(req: Request, res: Response, next: NextFunction) {
    const profileId = res.locals.profileId as number;
    let { labelUserId, isLabelApproved } = req.body as unknown as {
      labelUserId?: string;
      isLabelApproved?: boolean;
    };
    assertLoggedIn(req);
    const loggedInUser = req.user;

    try {
      if (Number(labelUserId) !== loggedInUser.id) {
        throw new AppError({
          httpCode: 401,
          description: "You are not allowed to approve this artist",
        });
      }

      const artist = await prisma.profile.findUnique({
        where: {
          id: profileId,
        },
      });

      await prisma.artistLabel.updateMany({
        where: {
          labelUserId: Number(labelUserId),
          artistId: profileId,
        },
        data: {
          isLabelApproved,
          canLabelAddReleases:
            Number(labelUserId) === loggedInUser.id &&
            loggedInUser.id === artist?.userId,
          canLabelManageArtist:
            Number(labelUserId) === loggedInUser.id &&
            loggedInUser.id === artist?.userId,
        },
      });

      const labels = await prisma.artistLabel.findMany({
        where: {
          artistId: profileId,
        },
      });
      res.json({
        results: labels,
      });
    } catch (e) {
      next(e);
    }
  }

  return operations;
}

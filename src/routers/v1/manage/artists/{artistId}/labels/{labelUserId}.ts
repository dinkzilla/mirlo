import { NextFunction, Request, Response } from "express";

import prisma from "@mirlo/prisma";
import {
  profileBelongsToLoggedInUser,
  userAuthenticated,
} from "../../../../../../auth/passport";
import { AppError } from "../../../../../../utils/error";

export default function () {
  const operations = {
    DELETE: [userAuthenticated, profileBelongsToLoggedInUser, DELETE],
    PUT: [userAuthenticated, profileBelongsToLoggedInUser, PUT],
  };
  async function PUT(req: Request, res: Response, next: NextFunction) {
    const { labelUserId } = req.params;
    const artistId = res.locals.artistId as number;

    try {
      const { isArtistApproved } = req.body;

      await prisma.artistLabel.updateMany({
        where: {
          labelUserId: Number(labelUserId),
          artistId: artistId,
        },
        data: {
          isArtistApproved,
          canLabelManageArtist: isArtistApproved,
          canLabelAddReleases: isArtistApproved,
        },
      });

      const labels = await prisma.artistLabel.findMany({
        where: {
          artistId: artistId,
        },
      });
      res.json({
        results: labels,
      });
    } catch (e) {
      next(e);
    }
  }

  async function DELETE(req: Request, res: Response, next: NextFunction) {
    const { labelUserId } = req.params;
    const artistId = res.locals.artistId as number;

    try {
      if (!labelUserId) {
        throw new AppError({ httpCode: 400, description: "Need labelUserId" });
      }

      await prisma.artistLabel.deleteMany({
        where: {
          labelUserId: Number(labelUserId),
          artistId: artistId,
        },
      });

      const labels = await prisma.artistLabel.findMany({
        where: {
          artistId: artistId,
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

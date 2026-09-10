import prisma from "@mirlo/prisma";
import { NextFunction, Request, Response } from "express";
import { merge } from "lodash";

import { assertLoggedIn } from "../../../../../auth/getLoggedInUser";
import {
  profileBelongsToLoggedInUser,
  userAuthenticated,
} from "../../../../../auth/passport";
import { serializeProfile } from "../../../../../serializers/artist";
import { deleteProfile, singleInclude } from "../../../../../utils/artist";
import { AppError } from "../../../../../utils/error";
import generateSlug from "../../../../../utils/generateSlug";

export default function () {
  const operations = {
    PUT: [userAuthenticated, profileBelongsToLoggedInUser, PUT],
    GET: [userAuthenticated, profileBelongsToLoggedInUser, GET],
    DELETE: [userAuthenticated, profileBelongsToLoggedInUser, DELETE],
  };

  async function PUT(req: Request, res: Response, next: NextFunction) {
    const profileId = res.locals.artistId as number;
    const {
      bio,
      name,
      urlSlug,
      properties,
      links,
      linksJson,
      location,
      activityPub,
      federatedStreaming,
      purchaseEntireCatalogMinPrice,
      purchaseEntireCatalogPercentage,
      defaultPlatformFee,
      tourDates,
      shortDescription,
      maxFreePlays,
      announcementText,
      allowDirectMessages,
      displayLabelUserId,
    } = req.body;
    assertLoggedIn(req);
    const user = req.user;

    if (
      purchaseEntireCatalogPercentage !== undefined &&
      purchaseEntireCatalogPercentage !== null &&
      (purchaseEntireCatalogPercentage < 0 ||
        purchaseEntireCatalogPercentage > 100)
    ) {
      return next(
        new AppError({
          httpCode: 400,
          description:
            "purchaseEntireCatalogPercentage must be between 0 and 100",
        })
      );
    }

    try {
      const existingProfile = await prisma.profile.findFirst({
        where: {
          id: profileId,
        },
      });
      // FIXME: check type of properties object.
      const oldProperties = existingProfile?.properties || {};

      let federatedStreamingOptInDate =
        existingProfile?.federatedStreamingOptInDate;
      let federatedStreamingOptOutDate =
        existingProfile?.federatedStreamingOptInDate;

      if (existingProfile?.federatedStreaming != federatedStreaming) {
        if (federatedStreaming) {
          federatedStreamingOptInDate = new Date(Date.now());
        } else {
          federatedStreamingOptOutDate = new Date(Date.now());
        }
      }

      const updatedCount = await prisma.$transaction(async (tx) => {
        if (displayLabelUserId !== undefined) {
          await tx.artistLabel.updateMany({
            where: {
              artistId: profileId,
              isDisplayedOnArtistPage: true,
            },
            data: { isDisplayedOnArtistPage: false },
          });
          if (displayLabelUserId !== null) {
            const approvedLabel = await tx.artistLabel.findFirst({
              where: {
                artistId: profileId,
                labelUserId: Number(displayLabelUserId),
                isArtistApproved: true,
                isLabelApproved: true,
              },
            });
            if (!approvedLabel) {
              throw new AppError({
                httpCode: 400,
                description:
                  "This label is not approved on both sides yet, so it can't be displayed on the artist page.",
              });
            }
            await tx.artistLabel.update({
              where: {
                labelUserId_artistId: {
                  artistId: profileId,
                  labelUserId: Number(displayLabelUserId),
                },
              },
              data: { isDisplayedOnArtistPage: true },
            });
          }
        }

        const result = await tx.profile.updateMany({
          where: {
            id: profileId,
          },
          data: {
            bio,
            name,
            links,
            linksJson,
            location,
            activityPub,
            federatedStreaming,
            federatedStreamingOptInDate,
            federatedStreamingOptOutDate,
            purchaseEntireCatalogMinPrice,
            purchaseEntireCatalogPercentage,
            defaultPlatformFee,
            shortDescription,
            maxFreePlays,
            announcementText,
            allowDirectMessages,
            ...(urlSlug
              ? {
                  urlSlug: generateSlug(urlSlug),
                }
              : {}),
            properties: merge(oldProperties, properties),
          },
        });

        if (tourDates) {
          await tx.artistTourDate.deleteMany({
            where: {
              artistId: profileId,
            },
          });
          await tx.artistTourDate.createMany({
            data: tourDates.map((tourDate: any) => ({
              artistId: profileId,
              location: tourDate.location,
              date: new Date(tourDate.date),
              ticketsUrl: tourDate.ticketsUrl,
            })),
          });
        }

        return result.count;
      });

      if (updatedCount) {
        const artist = await prisma.profile.findFirst({
          where: { id: profileId },
        });
        res.json({
          result: artist ? serializeProfile(artist, Number(user.id)) : artist,
        });
      } else {
        res.json({
          error: "An unknown error occurred",
        });
      }
    } catch (error) {
      next(error);
    }
  }

  PUT.apiDoc = {
    summary: "Updates an artist belonging to a user",
    parameters: [
      {
        in: "path",
        name: "artistId",
        required: true,
        type: "string",
      },
      {
        in: "body",
        name: "artist",
        schema: {
          $ref: "#/definitions/Artist",
        },
      },
    ],
    responses: {
      200: {
        description: "Updated artist",
        schema: {
          $ref: "#/definitions/Artist",
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

  async function GET(req: Request, res: Response, next: NextFunction) {
    const profileId = res.locals.artistId as number;
    assertLoggedIn(req);
    const user = req.user;
    try {
      const artist = await prisma.profile.findFirst({
        where: {
          id: profileId,
        },
        include: {
          ...singleInclude({ includePrivate: true }),
          merch: {
            where: {
              deletedAt: null,
            },
            include: { images: true, includePurchaseTrackGroup: true },
          },
        } as any,
      });

      if (!artist) {
        return res.status(404).json({
          error: "Artist not found",
        });
      } else {
        return res.json({
          result: serializeProfile(artist, Number(user.id)),
        });
      }
    } catch (e) {
      next(e);
    }
  }

  GET.apiDoc = {
    summary: "Returns artist information that belongs to a user",
    parameters: [
      {
        in: "path",
        name: "artistId",
        required: true,
        type: "string",
      },
    ],
    responses: {
      200: {
        description: "An artist that matches the id",
        schema: {
          $ref: "#/definitions/Artist",
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

  async function DELETE(req: Request, res: Response, next: NextFunction) {
    const profileId = res.locals.artistId as number;
    assertLoggedIn(req);
    const user = req.user;

    try {
      await deleteProfile(Number(user.id), profileId);
    } catch (e) {
      return next(e);
    }
    res.json({ message: "Success" });
  }

  DELETE.apiDoc = {
    summary: "Deletes an Artist belonging to a user",
    parameters: [
      {
        in: "path",
        name: "artistId",
        required: true,
        type: "string",
      },
    ],
    responses: {
      200: {
        description: "Delete success",
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

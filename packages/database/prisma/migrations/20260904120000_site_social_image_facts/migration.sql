-- Facts about the share image, recorded when it is chosen (#220).
ALTER TABLE "Site" ADD COLUMN "socialImageWidth" INTEGER;
ALTER TABLE "Site" ADD COLUMN "socialImageHeight" INTEGER;
ALTER TABLE "Site" ADD COLUMN "socialImageBytes" INTEGER;

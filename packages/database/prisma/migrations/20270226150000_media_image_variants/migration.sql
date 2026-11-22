-- Photos sized and given a blur placeholder at upload (DEC-246).
ALTER TABLE "Media" ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "placeholder" TEXT,
ADD COLUMN "variants" JSONB,
ADD COLUMN "variantBytes" INTEGER NOT NULL DEFAULT 0;

-- Global businesses' media in their own bucket (owner, 22 Nov 2026). Every
-- stored file keeps the bucket it was written to; existing rows are in the
-- main one. No data moves.
CREATE TYPE "MediaBucket" AS ENUM ('MAIN', 'GLOBAL');

ALTER TABLE "Media" ADD COLUMN "bucket" "MediaBucket" NOT NULL DEFAULT 'MAIN';

ALTER TABLE "DataExport" ADD COLUMN "bucket" "MediaBucket" NOT NULL DEFAULT 'MAIN';

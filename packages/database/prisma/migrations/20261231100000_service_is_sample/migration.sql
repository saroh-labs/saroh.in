-- A trade starter's sample service (#1193, DEC-189): written at setup, kept
-- off every public read until the owner keeps or edits it. One column with a
-- default, additive only: every service made before it is the owner's own.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

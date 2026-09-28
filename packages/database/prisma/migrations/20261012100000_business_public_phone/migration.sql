-- A business's public phone (DEC-053, round 2 phase 2, F20): the one number
-- its site shows — the Visit us Call button and "Or call ‹Business› on
-- ‹phone›" when a sign-in code can't be sent. Nullable and additive: every
-- business before it, and every business that sets none, has none, and its
-- site shows no Call button.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "phone" TEXT;

-- Prisma cannot declare a CHECK, and does not read one as drift. The API
-- stores E.164 ("+919845012345") and refuses anything else with a sentence
-- on the field; the database refuses anything else outright.
ALTER TABLE "BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_phone_e164"
    CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');

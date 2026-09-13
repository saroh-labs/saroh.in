-- Preview link tokens are stored as a SHA-256 hash, never the raw secret (#284).
--
-- A raw token in the database is a working link to a merchant's unpublished
-- draft for anyone who can read the row. The API returns the token once, when
-- the link is created, and afterwards looks a link up by hashing the token the
-- visitor presents.
--
-- Existing rows are hashed in place with the function the API uses (SHA-256
-- over the UTF-8 token, as lowercase hex), so every link that works today
-- keeps working. The raw value cannot be recovered afterwards, which is the
-- point.
ALTER TABLE "SitePreviewLink" RENAME COLUMN "token" TO "tokenHash";

ALTER INDEX "SitePreviewLink_token_key" RENAME TO "SitePreviewLink_tokenHash_key";

UPDATE "SitePreviewLink"
SET "tokenHash" = encode(sha256(convert_to("tokenHash", 'UTF8')), 'hex');

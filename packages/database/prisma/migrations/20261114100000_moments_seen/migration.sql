-- The moments a business has seen (wave G): a first order, a first booking,
-- a tenth order, each said once for the whole business. One JSON object on
-- "Organization", a key per moment with the time it was put away. Additive,
-- with a default: every business before it has seen none, and the previous
-- image never reads it. "Organization" keeps its policies (they read the
-- row's id, not its columns).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "momentsSeen" JSONB NOT NULL DEFAULT '{}';

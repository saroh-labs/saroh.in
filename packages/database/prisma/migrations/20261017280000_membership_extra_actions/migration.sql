-- F17 (DEC-039): extra permissions for one person, on top of their role.
-- Additive: every existing membership starts with none and resolves exactly
-- as it did before. Membership already carries organizationId and its RLS.
ALTER TABLE "Membership" ADD COLUMN "extraActions" TEXT[] DEFAULT ARRAY[]::TEXT[];

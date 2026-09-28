-- C11 (#588, DEC-042): when staff removed a customer's details for a privacy
-- request. Additive: one nullable column, nothing backfilled (no contact has
-- been removed before this; the `removed+<id>@removed.invalid` placeholder
-- the readers already know stays as well).

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "removedAt" TIMESTAMP(3);

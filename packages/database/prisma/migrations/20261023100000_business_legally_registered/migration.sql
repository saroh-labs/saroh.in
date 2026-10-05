-- Setup's "Registered" answer is kept (prelaunch fix): Registered saves no
-- business type, so until now a business that said it was registered could
-- not be told apart from one that never answered. The take-money checklist
-- asks a business that said Registered for its real type (Pvt Ltd, LLP,
-- partnership…) before it goes live.
--
-- Additive (expand only): one nullable column the previous API image never
-- reads or writes. No backfill: businesses set up before it read as "not
-- asked", and the checklist treats them as it did before.
--
-- Rollback: the previous image ignores the column.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "legallyRegistered" BOOLEAN;

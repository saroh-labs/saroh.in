-- "How to pay us" (R32): every business, on every plan, can tell a customer
-- how to pay it offline — a UPI ID (the page draws its QR), bank details and
-- a short note. Shown only on a customer's own unpaid invoice, order and
-- booking pages.
--
-- Additive (expand only): six nullable columns the previous API image never
-- reads or writes. No backfill: a business with none set keeps today's
-- generic line.
--
-- Rollback: the previous image ignores the columns.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "payBankAccountName" TEXT,
ADD COLUMN     "payBankAccountNumber" TEXT,
ADD COLUMN     "payBankIfsc" TEXT,
ADD COLUMN     "payBankName" TEXT,
ADD COLUMN     "payNote" TEXT,
ADD COLUMN     "payUpiId" TEXT;

-- Prisma cannot declare a CHECK, and does not read one as drift. The API
-- refuses anything else with a sentence on the field; the database refuses
-- it outright: an IFSC is four letters, a 0 and six letters or digits, and
-- an account number is 9 to 18 digits.
ALTER TABLE "BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_payBankIfsc_shape"
    CHECK ("payBankIfsc" IS NULL OR "payBankIfsc" ~ '^[A-Z]{4}0[A-Z0-9]{6}$');

ALTER TABLE "BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_payBankAccountNumber_digits"
    CHECK ("payBankAccountNumber" IS NULL OR "payBankAccountNumber" ~ '^[0-9]{9,18}$');

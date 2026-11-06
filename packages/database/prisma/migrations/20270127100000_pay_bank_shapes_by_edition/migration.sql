-- A Global business keeps an account number or IBAN and an optional bank code
-- (sort code, routing number or SWIFT) in the same two columns India uses for
-- its account number and IFSC (stage 8). The old checks allowed only India's
-- shapes, so a Global save failed (6 Nov). The database now refuses anything
-- outside the union of both editions' shapes; the API still holds each
-- edition to its own (`business-pay-instructions.ts`): an IFSC and a 9 to 18
-- digit account for India, a bank code and an IBAN-length account for Global.
ALTER TABLE "BusinessProfile" DROP CONSTRAINT "BusinessProfile_payBankIfsc_shape";
ALTER TABLE "BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_payBankIfsc_shape"
    CHECK (
        "payBankIfsc" IS NULL
        OR ("payBankIfsc" ~ '^[A-Z0-9 -]{1,34}$' AND "payBankIfsc" ~ '[A-Z0-9]')
    );

ALTER TABLE "BusinessProfile" DROP CONSTRAINT "BusinessProfile_payBankAccountNumber_digits";
ALTER TABLE "BusinessProfile"
    ADD CONSTRAINT "BusinessProfile_payBankAccountNumber_digits"
    CHECK (
        "payBankAccountNumber" IS NULL
        OR ("payBankAccountNumber" ~ '^[A-Z0-9]{1,34}$' AND "payBankAccountNumber" ~ '[0-9]')
    );

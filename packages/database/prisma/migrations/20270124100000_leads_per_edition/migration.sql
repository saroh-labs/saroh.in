-- One lead and one waitlist entry per email on each edition (owner, 4 Nov).
-- Every row is India today, so the new keys can't clash.
DROP INDEX "SarohLead_emailKey_key";
DROP INDEX "SarohLead_signUpEmailKey_key";
CREATE UNIQUE INDEX "SarohLead_edition_emailKey_key" ON "SarohLead"("edition", "emailKey");
CREATE UNIQUE INDEX "SarohLead_edition_signUpEmailKey_key" ON "SarohLead"("edition", "signUpEmailKey");
CREATE INDEX "SarohLead_emailKey_idx" ON "SarohLead"("emailKey");
CREATE INDEX "SarohLead_signUpEmailKey_idx" ON "SarohLead"("signUpEmailKey");

DROP INDEX "WaitlistSignup_emailKey_businessKey_key";
CREATE UNIQUE INDEX "WaitlistSignup_edition_emailKey_businessKey_key" ON "WaitlistSignup"("edition", "emailKey", "businessKey");
CREATE INDEX "WaitlistSignup_emailKey_idx" ON "WaitlistSignup"("emailKey");

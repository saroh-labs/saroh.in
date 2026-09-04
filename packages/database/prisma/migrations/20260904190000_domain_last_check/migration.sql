-- The last verification attempt on a domain, and why it failed (#200).
ALTER TABLE "Domain" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
ALTER TABLE "Domain" ADD COLUMN "lastCheckResult" TEXT;

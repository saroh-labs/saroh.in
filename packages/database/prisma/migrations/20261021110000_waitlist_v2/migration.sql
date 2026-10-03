-- The waitlist, V2 (marketing plan U30; KTD-17, OQ-11, D-4, D-5).
--
-- Additive except one index: an entry is now unique per normalised email AND
-- business, so one owner can list a second business. The old unique index on
-- "email" goes; code from before this migration only ever looked an address
-- up by it, which still works without the constraint.

-- New columns. "emailKey" and "position" are filled below before they become
-- NOT NULL, so existing rows keep their place.
ALTER TABLE "WaitlistSignup" ADD COLUMN "businessKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "businessName" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "emailKey" TEXT,
ADD COLUMN "joinedAt" TIMESTAMP(3),
ADD COLUMN "kind" TEXT,
ADD COLUMN "plan" TEXT,
ADD COLUMN "position" INTEGER,
ADD COLUMN "refCode" TEXT,
ADD COLUMN "referredById" TEXT;

-- emailKey: the address as `waitlist-email.ts` normalises it (+tags dropped;
-- for Gmail, dots dropped and googlemail folded into gmail). When old rows
-- normalise alike, one keeps the key — the row whose address already IS the
-- key, else the oldest — and the rest keep their address as typed. Those
-- addresses are not normalised, so no key can equal them.
WITH keyed AS (
    SELECT
        "id",
        "email",
        "createdAt",
        CASE
            WHEN split_part("email", '@', 2) IN ('gmail.com', 'googlemail.com')
                THEN replace(split_part(split_part("email", '@', 1), '+', 1), '.', '') || '@gmail.com'
            ELSE split_part(split_part("email", '@', 1), '+', 1) || '@' || split_part("email", '@', 2)
        END AS "key"
    FROM "WaitlistSignup"
),
ranked AS (
    SELECT
        "id",
        "email",
        "key",
        row_number() OVER (
            PARTITION BY "key"
            ORDER BY ("email" = "key") DESC, "createdAt", "id"
        ) AS "rn"
    FROM keyed
)
UPDATE "WaitlistSignup" AS w
SET "emailKey" = CASE WHEN r."rn" = 1 THEN r."key" ELSE r."email" END
FROM ranked AS r
WHERE w."id" = r."id";

ALTER TABLE "WaitlistSignup" ALTER COLUMN "emailKey" SET NOT NULL;

-- position: existing rows in the order they joined, then a sequence (the
-- one `@default(autoincrement())` names) carries on from there.
WITH ordered AS (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS "n"
    FROM "WaitlistSignup"
)
UPDATE "WaitlistSignup" AS w
SET "position" = o."n"
FROM ordered AS o
WHERE w."id" = o."id";

CREATE SEQUENCE "WaitlistSignup_position_seq" AS INTEGER OWNED BY "WaitlistSignup"."position";
SELECT setval('"WaitlistSignup_position_seq"', COALESCE((SELECT max("position") FROM "WaitlistSignup"), 0) + 1, false);
ALTER TABLE "WaitlistSignup" ALTER COLUMN "position" SET DEFAULT nextval('"WaitlistSignup_position_seq"');
ALTER TABLE "WaitlistSignup" ALTER COLUMN "position" SET NOT NULL;

-- One waiting run of the waitlist retention sweep, like the renewal chain.
CREATE UNIQUE INDEX "Job_one_pending_waitlist_retention" ON "Job"("type") WHERE (type = 'waitlist.retention' AND status = 'PENDING');

CREATE UNIQUE INDEX "WaitlistSignup_refCode_key" ON "WaitlistSignup"("refCode");

CREATE INDEX "WaitlistSignup_referredById_idx" ON "WaitlistSignup"("referredById");

CREATE UNIQUE INDEX "WaitlistSignup_emailKey_businessKey_key" ON "WaitlistSignup"("emailKey", "businessKey");

DROP INDEX "WaitlistSignup_email_key";

ALTER TABLE "WaitlistSignup" ADD CONSTRAINT "WaitlistSignup_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "WaitlistSignup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

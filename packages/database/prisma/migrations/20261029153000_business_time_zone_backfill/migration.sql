-- Every business keeps a time zone (UX-008). Until now a business that never
-- set one had none, so the app wrote server-rendered times in the server's
-- UTC. Data only: no column changes, and nothing already set is touched — a
-- zone a business chose is never reset.
--
-- The zone given is the one every reader already falls back to
-- (`businessZone` in bookings/staff-availability.ts): its first active
-- service's zone, else its country's when that country keeps one zone,
-- else India's. So no business's times move.

UPDATE "BusinessProfile" bp
SET "timezone" = COALESCE(
        (
            SELECT s."timezone"
            FROM "Service" s
            WHERE s."organizationId" = bp."organizationId"
              AND s."deletedAt" IS NULL
              AND s."status" = 'ACTIVE'
              AND s."timezone" <> ''
            ORDER BY s."createdAt" ASC
            LIMIT 1
        ),
        CASE upper(trim(coalesce(bp."country", '')))
            WHEN 'AE' THEN 'Asia/Dubai'
            WHEN 'BD' THEN 'Asia/Dhaka'
            WHEN 'BH' THEN 'Asia/Bahrain'
            WHEN 'GB' THEN 'Europe/London'
            WHEN 'HK' THEN 'Asia/Hong_Kong'
            WHEN 'IE' THEN 'Europe/Dublin'
            WHEN 'LK' THEN 'Asia/Colombo'
            WHEN 'MY' THEN 'Asia/Kuala_Lumpur'
            WHEN 'NP' THEN 'Asia/Kathmandu'
            WHEN 'NZ' THEN 'Pacific/Auckland'
            WHEN 'OM' THEN 'Asia/Muscat'
            WHEN 'PK' THEN 'Asia/Karachi'
            WHEN 'QA' THEN 'Asia/Qatar'
            WHEN 'SA' THEN 'Asia/Riyadh'
            WHEN 'SG' THEN 'Asia/Singapore'
            WHEN 'KW' THEN 'Asia/Kuwait'
        END,
        'Asia/Kolkata'
    ),
    "updatedAt" = now()
WHERE bp."timezone" IS NULL OR bp."timezone" = '';

-- A business set up with no profile fields has no profile row: give it one
-- carrying only the zone. Every other column takes its default, which is
-- what "no profile" already read as.
INSERT INTO "BusinessProfile" ("id", "organizationId", "timezone", "createdAt", "updatedAt")
SELECT 'bp' || replace(gen_random_uuid()::text, '-', ''),
       o."id",
       COALESCE(
           (
               SELECT s."timezone"
               FROM "Service" s
               WHERE s."organizationId" = o."id"
                 AND s."deletedAt" IS NULL
                 AND s."status" = 'ACTIVE'
                 AND s."timezone" <> ''
               ORDER BY s."createdAt" ASC
               LIMIT 1
           ),
           'Asia/Kolkata'
       ),
       now(), now()
FROM "Organization" o
WHERE NOT EXISTS (
    SELECT 1 FROM "BusinessProfile" bp WHERE bp."organizationId" = o."id"
)
ON CONFLICT ("organizationId") DO NOTHING;

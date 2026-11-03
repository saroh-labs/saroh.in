-- Every business runs under one edition (DEC-204). Everything so far is India,
-- which the default records. A default means no table rewrite on this table.
CREATE TYPE "Edition" AS ENUM ('INDIA', 'GLOBAL');

ALTER TABLE "Organization" ADD COLUMN "edition" "Edition" NOT NULL DEFAULT 'INDIA';

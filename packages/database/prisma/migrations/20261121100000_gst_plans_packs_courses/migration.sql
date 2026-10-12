-- GST on membership plans, class packs and courses (12 Oct 2026): each
-- takes a rate, a SAC code and its own way of carrying GST, as a service
-- does. Additive: every column is nullable with no default, so a plan,
-- pack or course from before has no rate ("not set") and is priced the
-- business's way, exactly as it was. Nothing is backfilled and no issued
-- invoice is touched; the previous API image, which never reads these
-- columns, is unaffected. Row-level security on the three tables is
-- unchanged.

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "sacCode" TEXT,
ADD COLUMN     "gstPriceMode" TEXT;

-- AlterTable
ALTER TABLE "ClassPack" ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "sacCode" TEXT,
ADD COLUMN     "gstPriceMode" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "sacCode" TEXT,
ADD COLUMN     "gstPriceMode" TEXT;

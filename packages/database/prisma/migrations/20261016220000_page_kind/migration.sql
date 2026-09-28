-- Module pages (round-2 G14, DEC-046): a page has a kind, FREE for every
-- page that exists today, and a "Show in menu" switch, on for every page
-- that exists today. Additive: no page is moved, renamed or deleted, and
-- nothing is added to any site's menu.

-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('FREE', 'SHOP', 'BOOK', 'PRICES', 'JOURNAL', 'CONTACT');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "inMenu" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kind" "PageKind" NOT NULL DEFAULT 'FREE';

-- CreateIndex: at most one page of each module kind per site.
CREATE UNIQUE INDEX "Page_siteId_module_kind_key" ON "Page"("siteId", "kind") WHERE (kind <> 'FREE');

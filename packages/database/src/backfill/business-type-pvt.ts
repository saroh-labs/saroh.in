/**
 * F10b backfill — a private limited company is stored as `pvt`.
 *
 * Round 2, F10 (plan 2026-09-26-006, release boundary 9): the legal form
 * `company` is spelled `pvt` from F10 on. F10 shipped the readers (both
 * spellings read as Private limited) and still stored `company`. F10b's API
 * stores `pvt` for either spelling and answers a stored `company` as `pvt`;
 * this rewrites the rows already stored, so follow-up Z4 can stop accepting
 * `company` a release later.
 *
 * It changes only `BusinessProfile.type = 'company'`, to `pvt`. Every API in
 * production since F10 reads `pvt`, so it is safe while either image serves
 * and after a rollback to F10. It is idempotent: a second run rewrites
 * nothing. The F10 image still stores `company` until it stops serving, so
 * run it after the F10b deploy settles, and again after any rollback to F10
 * and re-deploy (docs/architecture/ROUND_2_PHASE_2_ROLLOUT.md, F10b).
 *
 * Run: `DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> pnpm --filter
 * @saroh/database exec tsx src/backfill/business-type-pvt.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

/** The old spelling this rewrites (`business-type.ts` in the API). */
export const LEGACY_BUSINESS_TYPE = "company";

export interface BusinessTypePvtBackfillReport {
    /** Profiles stored as `company` before the run. */
    companyBefore: number;
    /** Rows this run rewrote to `pvt`. */
    rewritten: number;
    /** Profiles still stored as `company` after it: must be 0. */
    companyAfter: number;
}

export async function countLegacyBusinessTypes(
    prisma: PrismaClient,
): Promise<number> {
    return prisma.businessProfile.count({
        where: { type: LEGACY_BUSINESS_TYPE },
    });
}

export async function backfillBusinessTypePvt(
    prisma: PrismaClient,
): Promise<BusinessTypePvtBackfillReport> {
    const companyBefore = await countLegacyBusinessTypes(prisma);
    const { count: rewritten } = await prisma.businessProfile.updateMany({
        where: { type: LEGACY_BUSINESS_TYPE },
        data: { type: "pvt" },
    });
    const companyAfter = await countLegacyBusinessTypes(prisma);
    return { companyBefore, rewritten, companyAfter };
}

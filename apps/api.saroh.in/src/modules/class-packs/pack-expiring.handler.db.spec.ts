/**
 * "Your classes expire on ‹date›" (DEC-174 U22, #1153) against a real
 * Postgres: the `class-packs.expiring` sweep queues PACK_EXPIRING a week
 * before a pack's use-by day, in the business's zone, for a holder with
 * classes left. A sweep run twice queues once and the customer is emailed
 * once. An extension moves the date: the new date is told a week before
 * it, and a notice queued for the old date tells nobody. Nothing left,
 * bought with a week or less to go, or Pack credits off: nothing. The
 * chain keeps one waiting run.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`. Only the
 * app env is stubbed (the credential key).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { prisma } from "@saroh/database";

import type { PackStudio } from "../../../test/fixtures/packs";
import {
    classBooking,
    emailsOf,
    holding,
    makePack,
    packStudio,
    pendingNotices,
    runNotices,
} from "../../../test/fixtures/packs";
import { dayWords } from "../../common/words-format";
import { InvoicesService } from "../invoices/invoices.service";
import { packExpiringNoticeKey } from "../site-accounts/notices/pack";
import { ClassPacksService } from "./class-packs.service";
import {
    PACK_EXPIRING_TYPE,
    PackExpiringHandler,
} from "./pack-expiring.handler";
import { extendPurchase } from "./pack-extend";

const sweep = new PackExpiringHandler();
const packs = new ClassPacksService(new InvoicesService());
const DAY = 86_400_000;

afterAll(async () => {
    await prisma.$disconnect();
});

/** Asha's 10-class pack, bought a month ago, running out in `days`. */
async function expiringIn(
    days: number,
    over: { studio?: PackStudio; boughtDaysAgo?: number } = {},
) {
    const s = over.studio ?? (await packStudio());
    const pack = await makePack(s, 10);
    const expiresAt = new Date(Date.now() + days * DAY);
    const purchaseId = await holding(s, pack.id, {
        credits: 10,
        expiresAt,
        boughtAt: new Date(Date.now() - (over.boughtDaysAgo ?? 30) * DAY),
    });
    return { s, pack, purchaseId, expiresAt };
}

describe("a pack expiring in 7 days", () => {
    it("is queued once, keyed to its date, and emailed once with how many and when", async () => {
        const { s, pack, purchaseId, expiresAt } = await expiringIn(7);
        // Three spent: seven left.
        for (const d of [1, 2, 3]) {
            await packs.useOnBooking(s.owner, await classBooking(s, d), {
                packPurchaseId: purchaseId,
            });
        }

        await sweep.sweep(new Date());
        await sweep.sweep(new Date());
        const queued = await pendingNotices(s.organizationId, "PACK_EXPIRING");
        expect(queued).toHaveLength(1);
        expect(queued[0]!.payload).toMatchObject({
            kind: "PACK_EXPIRING",
            eventKey: packExpiringNoticeKey(purchaseId, expiresAt),
            packPurchaseId: purchaseId,
            packExpiresAt: expiresAt.toISOString(),
        });

        await runNotices(s.organizationId, "PACK_EXPIRING");
        // Told already: another run queues nothing.
        await sweep.sweep(new Date());
        expect(
            await pendingNotices(s.organizationId, "PACK_EXPIRING"),
        ).toHaveLength(0);

        const emails = await emailsOf(s.organizationId, "PACK_EXPIRING");
        expect(emails).toHaveLength(1);
        const on = dayWords(expiresAt, "Asia/Kolkata", { year: true });
        expect(emails[0]!.body).toContain(
            `Your 7 classes in your ${pack.name} expire on ${on}.`,
        );
        expect(emails[0]!.subject).toBe(
            `Your classes at Rye Studio expire on ${on}`,
        );
    });

    it("not yet at 9 days, and nothing once its classes are all used", async () => {
        const early = await expiringIn(9);
        await sweep.sweep(new Date());
        expect(
            await pendingNotices(early.s.organizationId, "PACK_EXPIRING"),
        ).toHaveLength(0);

        const s = await packStudio();
        const pack = await makePack(s, 1);
        const purchaseId = await holding(s, pack.id, {
            credits: 1,
            expiresAt: new Date(Date.now() + 7 * DAY),
            boughtAt: new Date(Date.now() - 30 * DAY),
        });
        await packs.useOnBooking(s.owner, await classBooking(s, 1), {
            packPurchaseId: purchaseId,
        });
        await sweep.sweep(new Date());
        expect(
            await pendingNotices(s.organizationId, "PACK_EXPIRING"),
        ).toHaveLength(0);
    });

    it("an extension moves it: told again a week before the new date", async () => {
        const { s, purchaseId } = await expiringIn(7);
        await sweep.sweep(new Date());
        await runNotices(s.organizationId, "PACK_EXPIRING");
        expect(await emailsOf(s.organizationId, "PACK_EXPIRING")).toHaveLength(
            1,
        );

        await extendPurchase(s.owner, purchaseId, {
            days: 30,
            reason: "Away on holiday",
        });
        const moved = await prisma.packPurchase.findUniqueOrThrow({
            where: { id: purchaseId },
        });
        // Not today: the new date is 37 days away.
        await sweep.sweep(new Date());
        expect(
            await pendingNotices(s.organizationId, "PACK_EXPIRING"),
        ).toHaveLength(0);
        // A week before the new date.
        await sweep.sweep(new Date(moved.expiresAt.getTime() - 7 * DAY));
        const queued = await pendingNotices(s.organizationId, "PACK_EXPIRING");
        expect(queued).toHaveLength(1);
        expect(queued[0]!.payload).toMatchObject({
            eventKey: packExpiringNoticeKey(purchaseId, moved.expiresAt),
        });
        await runNotices(s.organizationId, "PACK_EXPIRING");
        expect(await emailsOf(s.organizationId, "PACK_EXPIRING")).toHaveLength(
            2,
        );
    });

    it("a notice queued for a date since moved tells nobody", async () => {
        const { s, purchaseId } = await expiringIn(7);
        await sweep.sweep(new Date());
        await extendPurchase(s.owner, purchaseId, {
            days: 10,
            reason: "Studio closed for a week",
        });
        await runNotices(s.organizationId, "PACK_EXPIRING");
        expect(await emailsOf(s.organizationId, "PACK_EXPIRING")).toHaveLength(
            0,
        );
    });

    it("a pack bought with a week or less to go says nothing", async () => {
        const { s } = await expiringIn(7, { boughtDaysAgo: 0 });
        await sweep.sweep(new Date());
        expect(
            await pendingNotices(s.organizationId, "PACK_EXPIRING"),
        ).toHaveLength(0);
    });

    it("with Pack credits off nothing is queued", async () => {
        const studio = await packStudio({ packCredits: false });
        await expiringIn(7, { studio });
        await sweep.sweep(new Date());
        expect(
            await pendingNotices(studio.organizationId, "PACK_EXPIRING"),
        ).toHaveLength(0);
    });
});

describe("the sweep's chain", () => {
    it("a run leaves exactly one next run waiting, however often it is asked", async () => {
        await prisma.job.deleteMany({ where: { type: PACK_EXPIRING_TYPE } });
        await sweep.ensureScheduled();
        const [job] = await prisma.job.findMany({
            where: { type: PACK_EXPIRING_TYPE },
        });
        await prisma.job.update({
            where: { id: job!.id },
            data: { status: "PROCESSING" },
        });
        await sweep.handle(job!);
        await sweep.schedule(new Date());
        await sweep.ensureScheduled();
        const waiting = await prisma.job.findMany({
            where: { type: PACK_EXPIRING_TYPE, status: "PENDING" },
        });
        expect(waiting).toHaveLength(1);
        expect(waiting[0]!.runAt.getTime()).toBeGreaterThan(
            Date.now() + 5 * 60 * 60 * 1000,
        );
    });
});

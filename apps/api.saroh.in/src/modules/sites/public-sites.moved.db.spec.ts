/**
 * `GET public/sites/moved/:address` against a real Postgres (DEC-069, plan
 * L2): an old address forwards to its site's origin now — the verified
 * domain first — only while its redirect lasts and the site is still there.
 * Everything else is the same 404. Read with no business's context, as the
 * renderer asks; rate-limited per visitor.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));

import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { PublicFooterService } from "./public-footer.service";
import type { PublicHeadService } from "./public-head.service";
import { PublicSitesController } from "./public-sites.controller";
import type { PublicVisitService } from "./public-visit.service";
import { siteMovedTo } from "./site-moved";
import type { SitePreviewLinksService } from "./site-preview-links.service";
import type { SitesService } from "./sites.service";

const DAY = 86_400_000;
const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const fresh = (label: string) => `${label}-${tag}-${++seq}`;

const roomy = () => new FixedWindowRateLimiter(1_000);
const moved = (address: string) =>
    siteMovedTo(address, "visitor", { limiter: roomy() });

/** A business whose site now lives at `now`, and `old` it held before. */
async function movedBusiness(
    old: string,
    redirectUntil: Date | null = new Date(Date.now() + 30 * DAY),
) {
    const now = `${old}-now`;
    const org = await prisma.organization.create({
        data: { name: "Rye", slug: now },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye",
            slug: `site-${++seq}`,
            subdomain: now,
        },
    });
    await prisma.addressReservation.create({
        data: {
            organizationId: org.id,
            address: old,
            siteId: site.id,
            redirectUntil,
            reservedUntil: new Date(Date.now() + 30 * DAY),
        },
    });
    return { organizationId: org.id, siteId: site.id, now };
}

describe("where an old address forwards", () => {
    it("answers the site's address now while the redirect lasts", async () => {
        const old = fresh("rye");
        const { now } = await movedBusiness(old);
        await expect(moved(old)).resolves.toEqual({
            to: `https://${now}.saroh.app`,
        });
        // Hosts arrive in any case.
        await expect(moved(old.toUpperCase())).resolves.toEqual({
            to: `https://${now}.saroh.app`,
        });
    });

    it("answers the verified custom domain when there is one", async () => {
        const old = fresh("rye");
        const b = await movedBusiness(old);
        await prisma.domain.create({
            data: {
                organizationId: b.organizationId,
                siteId: b.siteId,
                hostname: `shop.${old}.example.in`,
                status: "VERIFIED",
                verificationToken: "t",
                verifiedAt: new Date(),
            },
        });
        await expect(moved(old)).resolves.toEqual({
            to: `https://shop.${old}.example.in`,
        });
    });

    it("is a 404 once the redirect has ended, for a hold that never forwarded, and for a stranger", async () => {
        const ended = fresh("rye");
        await movedBusiness(ended, new Date(Date.now() - 1_000));
        const never = fresh("rye");
        await movedBusiness(never, null);

        for (const address of [ended, never, fresh("nobody")]) {
            await expect(moved(address)).rejects.toMatchObject({
                status: 404,
            });
        }
    });

    it("is a 404 when the site has since been deleted", async () => {
        const old = fresh("rye");
        const b = await movedBusiness(old);
        await prisma.site.update({
            where: { id: b.siteId },
            data: { deletedAt: new Date() },
        });
        await expect(moved(old)).rejects.toMatchObject({ status: 404 });
    });

    it("counts each visitor, and answers 429 past the limit", async () => {
        const old = fresh("rye");
        await movedBusiness(old);
        const tight = new FixedWindowRateLimiter(1);
        await expect(
            siteMovedTo(old, "visitor", { limiter: tight }),
        ).resolves.toBeDefined();
        await expect(
            siteMovedTo(old, "visitor", { limiter: tight }),
        ).rejects.toMatchObject({ status: 429 });
        await expect(
            siteMovedTo(old, "someone-else", { limiter: tight }),
        ).resolves.toBeDefined();
    });

    it("is served at public/sites/moved/:address with no session", async () => {
        const old = fresh("rye");
        const { now } = await movedBusiness(old);
        const controller = new PublicSitesController(
            {} as SitesService,
            {} as SitePreviewLinksService,
            {} as PublicVisitService,
            {} as PublicFooterService,
            {} as PublicHeadService,
        );
        await expect(
            controller.moved(old, "203.0.113.9", undefined),
        ).resolves.toEqual({ to: `https://${now}.saroh.app` });
    });
});

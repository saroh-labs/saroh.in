/**
 * Changing the web address against a real Postgres (DEC-069, plan L2): the
 * site and the setup address move together, the old address is held for
 * 90 days and forwards, a change back leaves no loop, a business holds at
 * most two old addresses, and a race for one address has one winner. The
 * read gives the origin (the verified domain first) and only the links that
 * are live. Under `TEST_RLS=on` a business never reads another's holds.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));

import { ConflictException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { isRlsTestMode } from "../../../test/rls-mode";
import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { FlagKey } from "../feature-flags/flags";
import { siteMovedTo } from "../sites/site-moved";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { WebAddressService } from "./web-address.service";

const DAY = 86_400_000;
const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
/** A fresh address, unique to this run. */
const fresh = (label: string) => `${label}-${tag}-${++seq}`;

const service = new WebAddressService();
const onboarding = new OrganizationOnboardingService(new AuditService());
const moved = (address: string) =>
    siteMovedTo(address, "spec", {
        limiter: new FixedWindowRateLimiter(1_000),
    });

const FLAGS = [
    FlagKey.WEB_ADDRESS_CHANGE,
    FlagKey.SITE_SHOP,
    FlagKey.MODULE_COMMERCE,
    FlagKey.MODULE_APPOINTMENTS,
];

beforeAll(async () => {
    for (const key of FLAGS) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: { enabledByDefault: false },
        });
    }
});

async function flag(organizationId: string, key: string, enabled = true) {
    await prisma.featureFlagOverride.upsert({
        where: { flagKey_organizationId: { flagKey: key, organizationId } },
        create: { flagKey: key, organizationId, enabled },
        update: { enabled },
    });
}

/**
 * A business at `address`, changing switched on unless `changeOff`. With a
 * site (published unless `draft`) at the same address unless `noSite`.
 */
async function business(
    address: string,
    over: {
        noSite?: boolean;
        draft?: boolean;
        changeOff?: boolean;
        siteAt?: string | null;
    } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: address },
    });
    if (!over.changeOff) await flag(org.id, FlagKey.WEB_ADDRESS_CHANGE);
    let siteId: string | null = null;
    if (!over.noSite) {
        const site = await prisma.site.create({
            data: {
                organizationId: org.id,
                name: "Rye",
                slug: `site-${++seq}`,
                subdomain: over.siteAt === undefined ? address : over.siteAt,
            },
        });
        siteId = site.id;
        if (!over.draft) {
            const publication = await prisma.publication.create({
                data: {
                    siteId: site.id,
                    organizationId: org.id,
                    snapshot: { pages: [] },
                    templateId: "blank",
                    templateVersion: 1,
                },
            });
            await prisma.site.update({
                where: { id: site.id },
                data: { currentPublicationId: publication.id },
            });
        }
    }
    const as = (role: OrgRole): OrganizationContext => ({
        organizationId: org.id,
        userId: `user_${role}`,
        role,
    });
    return { id: org.id, siteId, owner: as("OWNER"), as };
}

const holds = (organizationId: string) =>
    prisma.addressReservation.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
    });

/** A 409's response body. */
async function conflict(p: Promise<unknown>) {
    const error = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse() as {
        message: string;
        details: Record<string, unknown>;
    };
}

describe("changing the web address (DEC-069, L2)", () => {
    it("moves rye to rye-bakery, holds rye for 90 days, and rye forwards", async () => {
        const rye = fresh("rye");
        const to = `${rye}-bakery`;
        const b = await business(rye);
        const before = Date.now();

        const view = await service.change(b.owner, to);

        expect(view.address).toBe(to);
        expect(view.origin).toBe(`https://${to}.saroh.app`);
        expect(view.links.site).toBe(`https://${to}.saroh.app`);
        // The site answers at the new address, and the business's is it.
        const site = await prisma.site.findUnique({
            where: { subdomain: to },
            select: { id: true },
        });
        expect(site?.id).toBe(b.siteId);
        const org = await prisma.organization.findUnique({
            where: { id: b.id },
            select: { slug: true },
        });
        expect(org?.slug).toBe(to);

        const [row] = await holds(b.id);
        expect(row?.address).toBe(rye);
        expect(row?.siteId).toBe(b.siteId);
        const days = (row!.reservedUntil.getTime() - before) / DAY;
        expect(days).toBeGreaterThanOrEqual(90);
        expect(days).toBeLessThan(90.01);
        expect(row?.redirectUntil?.getTime()).toBe(
            row?.reservedUntil.getTime(),
        );
        expect(view.previous).toEqual([
            {
                address: rye,
                redirectUntil: row!.reservedUntil.toISOString(),
                reservedUntil: row!.reservedUntil.toISOString(),
            },
        ]);

        await expect(moved(rye)).resolves.toEqual({
            to: `https://${to}.saroh.app`,
        });
        // Anyone else setting up is told rye is taken.
        await expect(onboarding.checkAddress(rye)).resolves.toMatchObject({
            available: false,
        });

        const audit = await prisma.auditEvent.findFirst({
            where: {
                organizationId: b.id,
                action: AuditAction.OrganizationAddressChanged,
            },
            select: { metadata: true, actorUserId: true },
        });
        expect(audit).toEqual({
            metadata: { from: rye, to },
            actorUserId: "user_OWNER",
        });
    });

    it("changing back within the window drops the hold, so nothing loops", async () => {
        const rye = fresh("rye");
        const to = `${rye}-bakery`;
        const b = await business(rye);
        await service.change(b.owner, to);

        const view = await service.change(b.owner, rye);

        expect(view.address).toBe(rye);
        const rows = await holds(b.id);
        expect(rows.map((r) => r.address)).toEqual([to]);
        await expect(moved(rye)).rejects.toMatchObject({ status: 404 });
        await expect(moved(to)).resolves.toEqual({
            to: `https://${rye}.saroh.app`,
        });
    });

    // Under TEST_RLS the expired hold is released on another connection,
    // after this change's serializable snapshot was taken (DEV_LEARNINGS).
    it("moves back to its own address whose hold has run out, first time", async () => {
        const rye = fresh("rye");
        const b = await business(rye);
        await service.change(b.owner, `${rye}-bakery`);
        // More than 90 days on: its hold on rye has run out.
        await prisma.addressReservation.updateMany({
            where: { organizationId: b.id, address: rye },
            data: {
                redirectUntil: new Date(Date.now() - DAY),
                reservedUntil: new Date(Date.now() - DAY),
            },
        });

        const view = await service.change(b.owner, rye);

        expect(view.address).toBe(rye);
        expect((await holds(b.id)).map((r) => r.address)).toEqual([
            `${rye}-bakery`,
        ]);
    });

    it("answers the same address with no change at all", async () => {
        const rye = fresh("rye");
        const b = await business(rye);

        const view = await service.change(b.owner, rye);

        expect(view.address).toBe(rye);
        expect(await holds(b.id)).toEqual([]);
    });

    it("refuses a third change while two old addresses are held, naming the date", async () => {
        const a = fresh("rye");
        const b = await business(a);
        await service.change(b.owner, `${a}-b`);
        await service.change(b.owner, `${a}-c`);
        const [first] = await holds(b.id);

        const body = await conflict(service.change(b.owner, `${a}-d`));

        expect(body.message).toMatch(/^You can change your address again on /);
        expect(body.details).toMatchObject({
            field: "address",
            reason: "limit",
            availableOn: first!.reservedUntil.toISOString(),
        });
        const org = await prisma.organization.findUnique({
            where: { id: b.id },
            select: { slug: true },
        });
        expect(org?.slug).toBe(`${a}-c`);
    });

    it("counts both holds a change would add: never more than two held", async () => {
        const slug = fresh("rye");
        const served = `${slug}-site`;
        // A site on a variant, so the next change holds two addresses.
        const b = await business(slug, { siteAt: served });
        await prisma.addressReservation.create({
            data: {
                organizationId: b.id,
                address: `${slug}-older`,
                reservedUntil: new Date(Date.now() + 10 * DAY),
            },
        });

        const body = await conflict(service.change(b.owner, `${slug}-new`));

        expect(body.details).toMatchObject({
            field: "address",
            reason: "limit",
        });
        expect((await holds(b.id)).map((r) => r.address)).toEqual([
            `${slug}-older`,
        ]);
        const org = await prisma.organization.findUnique({
            where: { id: b.id },
            select: { slug: true },
        });
        expect(org?.slug).toBe(slug);
    });

    it("lets a business holding one address make a change that holds one more", async () => {
        const a = fresh("rye");
        const b = await business(a);
        await prisma.addressReservation.create({
            data: {
                organizationId: b.id,
                address: `${a}-older`,
                reservedUntil: new Date(Date.now() + 10 * DAY),
            },
        });

        const view = await service.change(b.owner, `${a}-new`);

        // One held, one added: exactly the limit, which is allowed.
        expect(view.address).toBe(`${a}-new`);
        expect((await holds(b.id)).map((r) => r.address).sort()).toEqual(
            [a, `${a}-older`].sort(),
        );
    });

    it("doesn't count an address already held twice: a change that adds none goes through at two held", async () => {
        const a = fresh("rye");
        const b = await business(a);
        // Two held, and one of them is the address being left, so the
        // change only renews that hold and adds nothing.
        for (const [address, days] of [
            [a, 5],
            [`${a}-older`, 10],
        ] as const) {
            await prisma.addressReservation.create({
                data: {
                    organizationId: b.id,
                    address,
                    reservedUntil: new Date(Date.now() + days * DAY),
                },
            });
        }

        const view = await service.change(b.owner, `${a}-new`);

        expect(view.address).toBe(`${a}-new`);
        const after = await holds(b.id);
        expect(after.map((r) => r.address).sort()).toEqual(
            [a, `${a}-older`].sort(),
        );
        // The left address is held from now, for the full window.
        const left = after.find((r) => r.address === a);
        expect(left!.reservedUntil.getTime()).toBeGreaterThan(
            Date.now() + 80 * DAY,
        );
    });

    it("names the day enough holds have run out, when a change would add two", async () => {
        const slug = fresh("rye");
        // A site on a variant: the change would hold both addresses.
        const b = await business(slug, { siteAt: `${slug}-site` });
        await prisma.businessProfile.create({
            data: { organizationId: b.id, timezone: "Pacific/Auckland" },
        });
        const sooner = new Date(Date.now() + 10 * DAY);
        // 11:30pm UTC: already the next day in Auckland.
        const later = DateTime.fromJSDate(new Date(Date.now() + 20 * DAY))
            .toUTC()
            .set({ hour: 23, minute: 30, second: 0, millisecond: 0 })
            .toJSDate();
        for (const [address, until] of [
            [`${slug}-one`, sooner],
            [`${slug}-two`, later],
        ] as const) {
            await prisma.addressReservation.create({
                data: { organizationId: b.id, address, reservedUntil: until },
            });
        }

        const body = await conflict(service.change(b.owner, `${slug}-new`));

        // Two held, two to add: both must run out, so it is the later one,
        // and its day in the business's zone.
        const day = DateTime.fromJSDate(later)
            .setZone("Pacific/Auckland")
            .toFormat("d LLL yyyy");
        expect(body.message).toBe(
            `You can change your address again on ${day}`,
        );
        expect(body.details).toMatchObject({
            reason: "limit",
            availableOn: later.toISOString(),
        });
    });

    it("takes another business's hold once it has run out, replacing the row", async () => {
        const wanted = fresh("rye");
        const old = await business(fresh("old"));
        await prisma.addressReservation.create({
            data: {
                organizationId: old.id,
                address: wanted,
                redirectUntil: new Date(Date.now() - DAY),
                reservedUntil: new Date(Date.now() - DAY),
            },
        });
        const b = await business(fresh("new"));

        await service.change(b.owner, wanted);

        const row = await prisma.addressReservation.findUnique({
            where: { address: wanted },
        });
        expect(row).toBeNull();
        expect(
            (await prisma.site.findUnique({ where: { subdomain: wanted } }))
                ?.organizationId,
        ).toBe(b.id);
    });

    it("moves only the setup address of a business with no site, and it forwards nowhere", async () => {
        const rye = fresh("rye");
        const b = await business(rye, { noSite: true });

        const view = await service.change(b.owner, `${rye}-2`);

        expect(view.address).toBe(`${rye}-2`);
        expect(view.links).toEqual({ site: null, shop: null, book: null });
        const [row] = await holds(b.id);
        expect(row).toMatchObject({
            address: rye,
            siteId: null,
            redirectUntil: null,
        });
        await expect(moved(rye)).rejects.toMatchObject({ status: 404 });
    });

    it("holds the site's address and a differing setup address; only the site's forwards", async () => {
        const slug = fresh("rye");
        const served = `${slug}-site`;
        const b = await business(slug, { siteAt: served });

        await service.change(b.owner, `${slug}-new`);

        const rows = await holds(b.id);
        expect(
            rows.map((r) => [r.address, r.redirectUntil !== null]).sort(),
        ).toEqual([
            [slug, false],
            [served, true],
        ]);
    });

    it("gives a site with no address one, holding only the setup address", async () => {
        const slug = fresh("rye");
        const b = await business(slug, { siteAt: null, draft: true });

        await service.change(b.owner, `${slug}-x`);

        const site = await prisma.site.findUnique({
            where: { id: b.siteId! },
            select: { subdomain: true },
        });
        expect(site?.subdomain).toBe(`${slug}-x`);
        expect((await holds(b.id)).map((r) => r.address)).toEqual([slug]);
    });

    it("uses a verified custom domain as the origin, and forwards there", async () => {
        const rye = fresh("rye");
        const b = await business(rye);
        const hostname = `shop.${rye}.example.in`;
        await prisma.domain.create({
            data: {
                organizationId: b.id,
                siteId: b.siteId,
                hostname,
                status: "VERIFIED",
                verificationToken: "t",
                verifiedAt: new Date(),
            },
        });

        const view = await service.change(b.owner, `${rye}-bakery`);

        expect(view.origin).toBe(`https://${hostname}`);
        expect(view.customDomain).toBe(hostname);
        expect(view.platformOrigin).toBe(`https://${rye}-bakery.saroh.app`);
        await expect(moved(rye)).resolves.toEqual({
            to: `https://${hostname}`,
        });
    });
});

describe("what a change refuses", () => {
    it("refuses an Admin (403)", async () => {
        const b = await business(fresh("rye"));
        await expect(
            service.change(b.as("ADMIN"), fresh("other")),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses the owner while changing isn't switched on (403)", async () => {
        const b = await business(fresh("rye"), { changeOff: true });
        await expect(service.change(b.owner, fresh("other"))).rejects.toThrow(
            "Changing your web address isn't available yet",
        );
        const view = await service.read(b.owner);
        expect(view).toMatchObject({
            changeAvailable: false,
            canChange: false,
        });
    });

    it("says an Admin can't change it, and the owner can", async () => {
        const b = await business(fresh("rye"));
        await expect(service.read(b.as("ADMIN"))).resolves.toMatchObject({
            changeAvailable: true,
            canChange: false,
        });
        await expect(service.read(b.owner)).resolves.toMatchObject({
            canChange: true,
        });
    });

    it("refuses a taken address (409) with a free one to try", async () => {
        const theirs = fresh("rye");
        await business(theirs);
        const b = await business(fresh("mine"));

        const body = await conflict(service.change(b.owner, theirs));

        expect(body.details).toEqual({
            field: "address",
            reason: "taken",
            suggestion: `${theirs}-2`,
        });
    });

    it("refuses another business's live hold (409)", async () => {
        const rye = fresh("rye");
        const holder = await business(rye);
        await service.change(holder.owner, `${rye}-bakery`);
        const b = await business(fresh("mine"));

        const body = await conflict(service.change(b.owner, rye));
        expect(body.details).toMatchObject({ reason: "taken" });
    });

    it("lets one of two businesses racing for an address win; the other gets a 409", async () => {
        const wanted = fresh("race");
        const a = await business(fresh("a"));
        const b = await business(fresh("b"));

        const results = await Promise.allSettled([
            service.change(a.owner, wanted),
            service.change(b.owner, wanted),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const [lost] = results.filter(
            (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(lost?.reason).toBeInstanceOf(ConflictException);
        expect(
            await prisma.organization.count({ where: { slug: wanted } }),
        ).toBe(1);
    });
});

describe("availability", () => {
    it("is free for a new address, its own held one and its current one", async () => {
        const rye = fresh("rye");
        const b = await business(rye);
        await expect(
            service.availability(b.owner, fresh("free")),
        ).resolves.toMatchObject({ ok: true, reason: null });
        await expect(service.availability(b.owner, rye)).resolves.toMatchObject(
            {
                ok: true,
            },
        );
        await service.change(b.owner, `${rye}-bakery`);
        await expect(service.availability(b.owner, rye)).resolves.toMatchObject(
            {
                ok: true,
            },
        );
    });

    it("says why not, with a suggestion when it is taken", async () => {
        const theirs = fresh("rye");
        await business(theirs);
        const b = await business(fresh("mine"));

        await expect(service.availability(b.owner, theirs)).resolves.toEqual({
            address: theirs,
            ok: false,
            reason: `${theirs}.saroh.app is taken`,
            suggestion: `${theirs}-2`,
        });
        await expect(
            service.availability(b.owner, "A--B"),
        ).resolves.toMatchObject({
            address: "a--b",
            ok: false,
            reason: "An address can't have two hyphens in a row",
            suggestion: null,
        });
    });
});

describe("the read's links (KTD-8)", () => {
    it("offers no link for a site that isn't published", async () => {
        const b = await business(fresh("rye"), { draft: true });
        const view = await service.read(b.owner);
        expect(view.links).toEqual({ site: null, shop: null, book: null });
    });

    it("offers the booking page only while Appointments is rolled out and on", async () => {
        const rye = fresh("rye");
        const b = await business(rye);
        await expect(service.read(b.owner)).resolves.toMatchObject({
            links: { book: null },
        });

        await flag(b.id, FlagKey.MODULE_APPOINTMENTS);
        await expect(service.read(b.owner)).resolves.toMatchObject({
            links: { book: `https://${rye}.saroh.app/book` },
        });

        await prisma.organizationModule.create({
            data: {
                organizationId: b.id,
                moduleKey: "APPOINTMENTS",
                status: "DISABLED",
            },
        });
        await expect(service.read(b.owner)).resolves.toMatchObject({
            links: { book: null },
        });
    });

    it("offers the shop only once it sells something from where the site sells", async () => {
        const rye = fresh("rye");
        const b = await business(rye);
        await flag(b.id, FlagKey.SITE_SHOP);
        await flag(b.id, FlagKey.MODULE_COMMERCE);
        const store = await prisma.store.create({
            data: {
                name: "Online",
                slug: fresh("store"),
                organizationId: b.id,
            },
        });
        await prisma.site.update({
            where: { id: b.siteId! },
            data: { storefrontId: store.id },
        });
        await expect(service.read(b.owner)).resolves.toMatchObject({
            links: { shop: null },
        });

        const product = await prisma.product.create({
            data: {
                organizationId: b.id,
                name: "Sourdough",
                slug: fresh("sourdough"),
                price: "250.00",
                currency: "INR",
                status: "PUBLISHED",
            },
        });
        await prisma.productListing.create({
            data: {
                organizationId: b.id,
                storeId: store.id,
                productId: product.id,
            },
        });
        await expect(service.read(b.owner)).resolves.toMatchObject({
            links: { shop: `https://${rye}.saroh.app/shop` },
        });
    });
});

const describeRls = isRlsTestMode() ? describe : describe.skip;

describeRls("row-level security (TEST_RLS=on)", () => {
    it("never shows one business another's old addresses", async () => {
        const theirs = fresh("rye");
        const other = await business(theirs);
        await service.change(other.owner, `${theirs}-bakery`);
        const b = await business(fresh("mine"));
        await service.change(b.owner, `${theirs}-mine`);

        const view = await service.read(b.owner);
        expect(view.previous.map((p) => p.address)).toEqual([
            expect.stringMatching(/^mine-/),
        ]);
        // …yet the other's hold still counts as taken for it.
        await expect(
            service.availability(b.owner, theirs),
        ).resolves.toMatchObject({
            ok: false,
        });
    });
});

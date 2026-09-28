/**
 * The business's public phone against a real Postgres (DEC-053, F20): set in
 * Settings › Business, it is what the site's public reads give — the Visit us
 * read (a shop and the profile fallback alike, G8/E6) and the sign-in sheet's
 * "Or call ‹Business›" (A2/A9) — and removing it takes it off them on the
 * very next read, since neither is cached. Another business's number never
 * shows, and the audit row names the field without its value.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import {
    businessPublicPhone,
    resolveSiteHost,
} from "../site-accounts/site-host";
import { PublicVisitService } from "./public-visit.service";

const settings = new OrganizationSettingsService(
    new AuditService(),
    {} as MediaService,
);
const visits = new PublicVisitService(new FixedWindowRateLimiter(1_000));

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

/** A business with a published site at `<subdomain>.saroh.app`. */
async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("f20-org-") },
    });
    const subdomain = uniq("fphone");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: uniq("f20-site-"),
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: { pages: [{ path: "/", sections: [] }] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    return { ctx, siteId: site.id, host: `${subdomain}.saroh.app` };
}

/** What the sign-in sheet is told, as `options` reads it. */
async function signInPhone(host: string): Promise<string | null> {
    const site = await resolveSiteHost(host);
    return runInOrgContext(site.organizationId, () =>
        businessPublicPhone(site),
    );
}

describe("the business's public phone (real database)", () => {
    it("is saved as E.164 and shown on every public read, then removed from them", async () => {
        const kavi = await business("Kavi Dental");

        // None set: nothing to show, never an empty or placeholder number.
        expect((await settings.get(kavi.ctx)).profile).toBeNull();
        expect(
            (await visits.read(kavi.siteId, undefined, "visitor")).phone,
        ).toBeNull();
        expect(await signInPhone(kavi.host)).toBeNull();

        // An org with no profile row yet gets one.
        const saved = await settings.update(kavi.ctx, {
            profile: { phone: "+91 80 4000 1234" },
        });
        expect(saved.profile?.phone).toBe("+918040001234");
        expect((await settings.get(kavi.ctx)).profile?.phone).toBe(
            "+918040001234",
        );

        // The profile fallback (no shop) and a shop both carry it.
        expect(
            await visits.read(kavi.siteId, undefined, "visitor"),
        ).toMatchObject({ source: "business", phone: "+918040001234" });
        const shop = await prisma.store.create({
            data: {
                name: "Indiranagar",
                slug: uniq("f20-store-"),
                organizationId: kavi.ctx.organizationId,
                settings: {
                    create: { kind: "SHOP", address: "12th Main" },
                },
            },
        });
        expect(
            await visits.read(kavi.siteId, shop.id, "visitor"),
        ).toMatchObject({
            source: "storefront",
            storeId: shop.id,
            phone: "+918040001234",
        });
        expect(await signInPhone(kavi.host)).toBe("+918040001234");

        // Removed: gone from the next read of each, with nothing cached.
        const cleared = await settings.update(kavi.ctx, {
            profile: { phone: "" },
        });
        expect(cleared.profile?.phone).toBeNull();
        expect(
            (await visits.read(kavi.siteId, shop.id, "visitor")).phone,
        ).toBeNull();
        expect(
            (await visits.read(kavi.siteId, undefined, "visitor")).phone,
        ).toBeNull();
        expect(await signInPhone(kavi.host)).toBeNull();
    });

    it("records the change by name only, never the number", async () => {
        const rye = await business("Rye & Co.");
        await settings.update(rye.ctx, {
            profile: { phone: "+91 98450 12345" },
        });
        const rows = await prisma.auditEvent.findMany({
            where: {
                organizationId: rye.ctx.organizationId,
                action: AuditAction.ProfileUpdate,
            },
        });
        expect(rows).toHaveLength(1);
        const metadata = rows[0]?.metadata as {
            fields: string[];
            changes: unknown[];
        };
        expect(metadata.fields).toEqual(["phone"]);
        expect(metadata.changes).toEqual([]);
        expect(JSON.stringify(metadata)).not.toContain("98450");
    });

    it("refuses a number without a country code, and keeps the saved one", async () => {
        const pulse = await business("Pulse Fitness");
        await settings.update(pulse.ctx, {
            profile: { phone: "+919845012345" },
        });
        const refusal = await settings
            .update(pulse.ctx, { profile: { phone: "98450 12345" } })
            .catch((e: unknown) => e);
        expect(refusal).toBeInstanceOf(BadRequestException);
        expect((refusal as BadRequestException).getResponse()).toMatchObject({
            details: { field: "phone" },
        });
        expect((await settings.get(pulse.ctx)).profile?.phone).toBe(
            "+919845012345",
        );
    });

    it("keeps the phone when another field is saved", async () => {
        const kiln = await business("Kiln Studio");
        await settings.update(kiln.ctx, {
            profile: { phone: "+919845012345" },
        });
        await settings.update(kiln.ctx, {
            profile: { website: "https://kiln.test" },
        });
        expect((await settings.get(kiln.ctx)).profile?.phone).toBe(
            "+919845012345",
        );
    });

    it("never shows one business's number on another's site", async () => {
        const a = await business("Has A Phone");
        const b = await business("Has None");
        await settings.update(a.ctx, { profile: { phone: "+441134960000" } });
        expect(
            (await visits.read(b.siteId, undefined, "visitor")).phone,
        ).toBeNull();
        expect(await signInPhone(b.host)).toBeNull();
        expect(await signInPhone(a.host)).toBe("+441134960000");
    });

    it("never serves a stored value that isn't E.164", async () => {
        // Past the API, the migration's CHECK refuses this; `db push` builds
        // the test schema without it, so the read's own re-check is what
        // this proves. A schema that does have the CHECK (the RLS run adds
        // it) already makes such a row impossible, so there is nothing left
        // to prove there.
        const [{ enforced }] = await prisma.$queryRaw<{ enforced: boolean }[]>`
            SELECT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'BusinessProfile_phone_e164'
            ) AS enforced`;
        if (enforced) return;
        const odd = await business("Odd Number");
        await prisma.businessProfile.create({
            data: {
                organizationId: odd.ctx.organizationId,
                phone: "call the shop",
            },
        });
        expect(
            (await visits.read(odd.siteId, undefined, "visitor")).phone,
        ).toBeNull();
        expect(await signInPhone(odd.host)).toBeNull();
    });
});

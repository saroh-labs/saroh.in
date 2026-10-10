/**
 * A business's contact details and social links against a real Postgres
 * (DEC-125): set in Settings, they are what the site's public contact read
 * gives on the very next read, with no publish, and clearing takes them off.
 * The address is where customers come: a location with no counter never
 * shows its own, and the registered address only when the owner chose it.
 * Another business's details never show.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { PublicContactService } from "./public-contact.service";

const settings = new OrganizationSettingsService(
    new AuditService(),
    {} as MediaService,
);
const contacts = new PublicContactService(new FixedWindowRateLimiter(1_000));

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

/** A business with a site. */
async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("dec125-org-") },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: uniq("dec125-site-"),
            subdomain: uniq("dec125"),
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    return { ctx, siteId: site.id };
}

function location(
    organizationId: string,
    name: string,
    kind: "SHOP" | "ONLINE",
    address: string | null,
) {
    return prisma.store.create({
        data: {
            name,
            slug: uniq("dec125-store-"),
            organizationId,
            settings: { create: { kind, address } },
        },
    });
}

const read = (siteId: string) => contacts.read(siteId, "visitor");

describe("a business's contact details on its site (real database)", () => {
    it("shows social links as soon as they are saved, and drops them when cleared", async () => {
        const rye = await business("Rye & Co.");
        expect(await read(rye.siteId)).toEqual({
            phone: null,
            email: null,
            places: [],
            social: [],
        });

        const saved = await settings.update(rye.ctx, {
            socialLinks: {
                instagram: "@rye.bakery",
                whatsapp: "+91 98450 12345",
                googleMaps: "https://maps.app.goo.gl/AbC123xyZ",
            },
            profile: {
                phone: "+91 98450 12345",
                contactEmail: "hello@rye.example.com",
            },
        });
        expect(saved.socialLinks).toEqual({
            instagram: "https://www.instagram.com/rye.bakery",
            whatsapp: "https://wa.me/919845012345",
            googleMaps: "https://maps.app.goo.gl/AbC123xyZ",
        });
        expect(await read(rye.siteId)).toEqual({
            phone: "+919845012345",
            email: "hello@rye.example.com",
            places: [],
            social: [
                {
                    network: "instagram",
                    url: "https://www.instagram.com/rye.bakery",
                },
                { network: "whatsapp", url: "https://wa.me/919845012345" },
                {
                    network: "googleMaps",
                    url: "https://maps.app.goo.gl/AbC123xyZ",
                },
            ],
        });

        // Replace one, clear one, leave one.
        await settings.update(rye.ctx, {
            socialLinks: { instagram: "instagram.com/rye", whatsapp: "" },
        });
        expect((await read(rye.siteId)).social).toEqual([
            { network: "instagram", url: "https://www.instagram.com/rye" },
            {
                network: "googleMaps",
                url: "https://maps.app.goo.gl/AbC123xyZ",
            },
        ]);
        expect((await settings.get(rye.ctx)).socialLinks).toEqual({
            instagram: "https://www.instagram.com/rye",
            googleMaps: "https://maps.app.goo.gl/AbC123xyZ",
        });

        await settings.update(rye.ctx, {
            socialLinks: { instagram: "", googleMaps: "" },
            profile: { phone: "", contactEmail: "" },
        });
        expect(await read(rye.siteId)).toEqual({
            phone: null,
            email: null,
            places: [],
            social: [],
        });
    });

    it("refuses an arbitrary address and keeps what was saved", async () => {
        const kiln = await business("Kiln Studio");
        await settings.update(kiln.ctx, { socialLinks: { x: "@kiln" } });
        const refusal = await settings
            .update(kiln.ctx, {
                socialLinks: { x: "https://evil.example/kiln" },
            })
            .catch((e: unknown) => e);
        expect(refusal).toBeInstanceOf(BadRequestException);
        expect((refusal as BadRequestException).getResponse()).toMatchObject({
            details: { field: "socialLinks.x" },
        });
        expect((await read(kiln.siteId)).social).toEqual([
            { network: "x", url: "https://x.com/kiln" },
        ]);
    });

    it("shows where customers come, never a location with no counter", async () => {
        const pulse = await business("Pulse Fitness");
        const org = pulse.ctx.organizationId;
        await location(org, "Stock room", "ONLINE", "7 Home Lane");
        expect((await read(pulse.siteId)).places).toEqual([]);

        await location(org, "Indiranagar", "SHOP", "12th Main");
        expect((await read(pulse.siteId)).places).toEqual([
            {
                source: "location",
                name: "Indiranagar",
                address: "12th Main",
                hours: null,
            },
        ]);

        await location(org, "Koramangala", "SHOP", "80 Feet Road");
        const closed = await location(org, "Old shop", "SHOP", "1 Past Road");
        await prisma.store.update({
            where: { id: closed.id },
            data: { deletedAt: new Date() },
        });
        expect(
            (await read(pulse.siteId)).places.map((p) => [p.name, p.address]),
        ).toEqual([
            ["Indiranagar", "12th Main"],
            ["Koramangala", "80 Feet Road"],
        ]);
    });

    it("shows the registered address only when the owner chose it", async () => {
        const asha = await business("Asha Rao");
        await settings.update(asha.ctx, {
            registeredAddress: {
                line1: "14 Hill Road",
                city: "Bengaluru",
                postalCode: "560038",
            },
        });
        // On file for invoices; not on the site.
        expect((await read(asha.siteId)).places).toEqual([]);

        const chosen = await settings.update(asha.ctx, {
            siteShowsRegisteredAddress: true,
        });
        expect(chosen.siteShowsRegisteredAddress).toBe(true);
        expect((await read(asha.siteId)).places).toEqual([
            {
                source: "registered",
                name: null,
                address: "14 Hill Road\nBengaluru 560038",
                hours: null,
            },
        ]);
        expect(await settings.siteContact(asha.ctx)).toMatchObject({
            registeredAddressChosen: true,
        });

        await settings.update(asha.ctx, {
            siteShowsRegisteredAddress: false,
        });
        expect((await read(asha.siteId)).places).toEqual([]);
    });

    it("never shows one business's details on another's site", async () => {
        const a = await business("Has Links");
        const b = await business("Has None");
        await settings.update(a.ctx, {
            socialLinks: { instagram: "@haslinks" },
            profile: { phone: "+441134960000" },
            siteShowsRegisteredAddress: true,
        });
        await location(a.ctx.organizationId, "A shop", "SHOP", "1 A Street");

        expect(await read(b.siteId)).toEqual({
            phone: null,
            email: null,
            places: [],
            social: [],
        });
        expect((await settings.siteContact(b.ctx)).contact.social).toEqual([]);
        expect((await settings.get(b.ctx)).socialLinks).toEqual({});
    });

    it("never serves a stored link that isn't a network's own address", async () => {
        const odd = await business("Odd Links");
        await prisma.businessProfile.create({
            data: {
                organizationId: odd.ctx.organizationId,
                socialLinks: {
                    instagram: "https://evil.example/odd",
                    x: "https://x.com/odd",
                },
            },
        });
        expect((await read(odd.siteId)).social).toEqual([
            { network: "x", url: "https://x.com/odd" },
        ]);
    });
});

/**
 * How to reach a business, as its website shows it (DEC-125): only what is
 * set, the address where customers come and never an online-only location's
 * or (unless chosen) the registered one, and only the caller's business.
 * DB-free.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        businessProfile: { findUnique: jest.fn() },
        store: { findMany: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import { businessPublicContactOf } from "./business-contact";

const profileFind = prisma.businessProfile.findUnique as jest.Mock;
const storesFind = prisma.store.findMany as jest.Mock;

const WEEK = [
    { day: "MON", open: "09:00", close: "18:00", closed: false },
    { day: "SUN", open: "09:00", close: "18:00", closed: true },
];

const PROFILE = {
    phone: "+919845012345",
    contactEmail: " hello@rye.example.com ",
    socialLinks: {
        whatsapp: "https://wa.me/919845012345",
        instagram: "https://www.instagram.com/rye",
    },
    siteShowsRegisteredAddress: false,
    addressLine1: "14 Hill Road",
    addressLine2: null,
    city: "Bengaluru",
    postalCode: "560038",
};

beforeEach(() => {
    jest.clearAllMocks();
    profileFind.mockResolvedValue(PROFILE);
    storesFind.mockResolvedValue([]);
});

describe("businessPublicContactOf", () => {
    it("reads only this business, and only locations customers visit", async () => {
        await businessPublicContactOf("org_1");
        expect(profileFind).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org_1" } }),
        );
        // An ONLINE location (no counter) is never asked for, so its
        // address can never be shown; nor is a closed one.
        expect(storesFind).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    deletedAt: null,
                    settings: { is: { kind: "SHOP" } },
                },
            }),
        );
    });

    it("gives the phone, the email and the social links in the networks' order", async () => {
        const contact = await businessPublicContactOf("org_1");
        expect(contact).toEqual({
            phone: "+919845012345",
            email: "hello@rye.example.com",
            places: [],
            social: [
                {
                    network: "instagram",
                    url: "https://www.instagram.com/rye",
                },
                { network: "whatsapp", url: "https://wa.me/919845012345" },
            ],
        });
    });

    it("shows nothing for a business that set nothing", async () => {
        profileFind.mockResolvedValue(null);
        expect(await businessPublicContactOf("org_1")).toEqual({
            phone: null,
            email: null,
            places: [],
            social: [],
        });
    });

    it("shows one location's address, with its hours", async () => {
        storesFind.mockResolvedValue([
            {
                name: "Indiranagar",
                settings: {
                    address: " 12th Main\nIndiranagar ",
                    openingHours: WEEK,
                },
            },
        ]);
        const { places } = await businessPublicContactOf("org_1");
        expect(places).toEqual([
            {
                source: "location",
                name: "Indiranagar",
                address: "12th Main\nIndiranagar",
                hours: WEEK,
            },
        ]);
    });

    it("shows each location's name and address, and skips one with no address", async () => {
        storesFind.mockResolvedValue([
            { name: "Indiranagar", settings: { address: "12th Main" } },
            { name: "Pop-up", settings: { address: "  " } },
            { name: "Koramangala", settings: { address: "80 Feet Road" } },
        ]);
        const { places } = await businessPublicContactOf("org_1");
        expect(places.map((p) => [p.name, p.address])).toEqual([
            ["Indiranagar", "12th Main"],
            ["Koramangala", "80 Feet Road"],
        ]);
    });

    it("never shows the registered address unless the owner chose it", async () => {
        expect((await businessPublicContactOf("org_1")).places).toEqual([]);

        profileFind.mockResolvedValue({
            ...PROFILE,
            siteShowsRegisteredAddress: true,
        });
        expect((await businessPublicContactOf("org_1")).places).toEqual([
            {
                source: "registered",
                name: null,
                address: "14 Hill Road\nBengaluru 560038",
                hours: null,
            },
        ]);
    });

    it("prefers a location's address to the chosen registered one", async () => {
        profileFind.mockResolvedValue({
            ...PROFILE,
            siteShowsRegisteredAddress: true,
        });
        storesFind.mockResolvedValue([
            { name: "Indiranagar", settings: { address: "12th Main" } },
        ]);
        const { places } = await businessPublicContactOf("org_1");
        expect(places.map((p) => p.source)).toEqual(["location"]);
    });

    it("never serves a stored phone or link that isn't what the API accepts", async () => {
        profileFind.mockResolvedValue({
            ...PROFILE,
            phone: "call the shop",
            contactEmail: "  ",
            socialLinks: {
                instagram: "https://evil.example/rye",
                x: "javascript:alert(1)",
            },
        });
        expect(await businessPublicContactOf("org_1")).toEqual({
            phone: null,
            email: null,
            places: [],
            social: [],
        });
    });
});

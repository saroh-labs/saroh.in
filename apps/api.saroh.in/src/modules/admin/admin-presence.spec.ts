jest.mock("@saroh/database", () => ({
    prisma: {
        site: { findMany: jest.fn() },
        domain: { findMany: jest.fn() },
        merchantPaymentProvider: { findMany: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import { organizationPresence, presenceOf } from "./admin-presence";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

const site = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "site_1",
    name: "Northwind",
    subdomain: "northwind",
    currentPublicationId: "pub_1",
    ...over,
});

const domain = (over: Partial<Record<string, unknown>> = {}) => ({
    hostname: "www.northwind.example.com",
    siteId: "site_1",
    status: "VERIFIED",
    hostingStatus: "ACTIVE",
    hostingError: null,
    hostingCheckedAt: null,
    ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("presenceOf", () => {
    it("links a published site's own domain first, then its web address", () => {
        const out = presenceOf({
            sites: [site()],
            domains: [domain()],
            providers: [],
            hostingOn: true,
        });
        expect(out.sites).toEqual([
            {
                id: "site_1",
                name: "Northwind",
                published: true,
                addresses: [
                    {
                        kind: "own-domain",
                        url: "https://www.northwind.example.com",
                    },
                    {
                        kind: "web-address",
                        url: expect.stringMatching(/^https:\/\/northwind\./),
                    },
                ],
            },
        ]);
    });

    it("leaves out an own domain that isn't live yet, or when hosting is off", () => {
        for (const [d, hostingOn] of [
            [domain({ hostingStatus: "PENDING" }), true],
            [domain({ hostingStatus: "FAILED" }), true],
            [domain({ status: "PENDING" }), true],
            [domain(), false],
            [domain({ siteId: "site_2" }), true],
        ] as const) {
            const out = presenceOf({
                sites: [site()],
                domains: [d],
                providers: [],
                hostingOn,
            });
            expect(out.sites[0]?.addresses.map((a) => a.kind)).toEqual([
                "web-address",
            ]);
        }
    });

    it("gives no address for a site with nothing published", () => {
        const out = presenceOf({
            sites: [site({ currentPublicationId: null })],
            domains: [domain()],
            providers: [],
            hostingOn: true,
        });
        expect(out.sites[0]).toMatchObject({
            published: false,
            addresses: [],
        });
    });

    it("says payments in yes-or-no terms and never carries a key", () => {
        const out = presenceOf({
            sites: [],
            domains: [],
            // Even handed a full row, only the name and two answers come out.
            providers: [
                {
                    provider: "RAZORPAY",
                    status: "CONNECTED",
                    attentionReason: null,
                    publicKey: "rzp_live_PUBLICKEYID",
                    encryptedCredentials: "CIPHERTEXT",
                    credentialsIv: "IV",
                    credentialsAuthTag: "TAG",
                } as never,
                {
                    provider: "CASHFREE",
                    status: "DISABLED",
                    attentionReason: "KEYS_REFUSED",
                },
            ],
            hostingOn: true,
        });
        expect(out.payments).toEqual([
            { provider: "RAZORPAY", connected: true, needsAttention: false },
            { provider: "CASHFREE", connected: false, needsAttention: true },
        ]);
        const json = JSON.stringify(out);
        for (const secret of ["rzp_live", "CIPHERTEXT", "IV", "TAG"]) {
            expect(json).not.toContain(secret);
        }
    });
});

describe("organizationPresence", () => {
    it("reads no credential column, and only the business's own rows", async () => {
        (prisma.site.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.domain.findMany as jest.Mock).mockResolvedValue([]);
        (
            prisma.merchantPaymentProvider.findMany as jest.Mock
        ).mockResolvedValue([]);
        await organizationPresence("org_1", true);

        const providerArgs = (
            prisma.merchantPaymentProvider.findMany as jest.Mock
        ).mock.calls[0][0];
        expect(providerArgs.where).toEqual({ organizationId: "org_1" });
        expect(Object.keys(providerArgs.select).sort()).toEqual([
            "attentionReason",
            "provider",
            "status",
        ]);
        expect(
            (prisma.site.findMany as jest.Mock).mock.calls[0][0].where,
        ).toEqual({ organizationId: "org_1", deletedAt: null });
        const domainArgs = (prisma.domain.findMany as jest.Mock).mock
            .calls[0][0];
        expect(domainArgs.where).toEqual({
            organizationId: "org_1",
            status: "VERIFIED",
        });
        expect(domainArgs.select).not.toHaveProperty("verificationToken");
    });
});

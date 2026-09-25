import { BadRequestException, ForbiddenException } from "@nestjs/common";

// Mock the database package so the service never touches a real Postgres. The
// `$transaction` mock invokes its callback with the same mocked client, so we
// can assert the rename and the profile upsert land in the ONE transaction.
jest.mock("@saroh/database", () => {
    const client = {
        organization: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        businessProfile: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
        },
        membership: {
            findMany: jest.fn(),
            count: jest.fn(),
        },
        order: { findFirst: jest.fn() },
    };
    return {
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { AuditAction } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import type { UpdateOrganizationDto } from "./dto";
import { OrganizationSettingsService } from "./organization-settings.service";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const orgUpdate = prisma.organization.update as jest.Mock;
const profileUpsert = prisma.businessProfile.upsert as jest.Mock;
const profileFindUnique = prisma.businessProfile.findUnique as jest.Mock;
const profileUpdateMany = prisma.businessProfile.updateMany as jest.Mock;
const membershipFindMany = prisma.membership.findMany as jest.Mock;
const membershipCount = prisma.membership.count as jest.Mock;
const orderFindFirst = prisma.order.findFirst as jest.Mock;

const ctx = (role: OrgRole = "OWNER") => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
});

describe("OrganizationSettingsService", () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const audit = { record } as unknown as AuditService;
    const readyObject = jest.fn();
    const media = { readyObject } as unknown as MediaService;
    const service = new OrganizationSettingsService(audit, media);

    beforeEach(() => {
        jest.clearAllMocks();
        orderFindFirst.mockResolvedValue(null);
        // Unregistered until a test registers it.
        profileFindUnique.mockResolvedValue(null);
        orgFindUnique.mockResolvedValue({
            id: "org_1",
            name: "Acme",
            slug: "acme",
            businessProfile: {
                legalName: "Acme Inc",
                type: "company",
                country: "IN",
                taxId: "TAX1",
                contactEmail: "hi@acme.test",
                website: "https://acme.test",
            },
        });
    });

    describe("get", () => {
        it("returns the org identity with its profile for OWNER/ADMIN", async () => {
            const settings = await service.get(ctx("ADMIN"));
            expect(settings.name).toBe("Acme");
            expect(settings.profile?.legalName).toBe("Acme Inc");
        });

        it("derives trading-since from the first order in the business", async () => {
            expect((await service.get(ctx())).tradingSince).toBeNull();

            orderFindFirst.mockResolvedValue({
                createdAt: new Date("2011-03-04T10:00:00Z"),
            });
            expect((await service.get(ctx())).tradingSince).toBe(
                "2011-03-04T10:00:00.000Z",
            );
            // Across every storefront, and never another tenant's.
            expect(orderFindFirst).toHaveBeenLastCalledWith({
                where: { organizationId: "org_1" },
                orderBy: { createdAt: "asc" },
                select: { createdAt: true },
            });
        });

        it("denies a MEMBER — legal/tax identity is not in the org:read floor", async () => {
            await expect(service.get(ctx("MEMBER"))).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            expect(orgFindUnique).not.toHaveBeenCalled();
        });
    });

    describe("update", () => {
        it("denies a MEMBER and writes nothing", async () => {
            await expect(
                service.update(ctx("MEMBER"), { name: "Evil" }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(orgUpdate).not.toHaveBeenCalled();
            expect(profileUpsert).not.toHaveBeenCalled();
            expect(record).not.toHaveBeenCalled();
        });

        it("renames the org and upserts the profile in one transaction", async () => {
            const dto: UpdateOrganizationDto = {
                name: "Acme Global",
                profile: { legalName: "Acme Global Inc" },
            };

            await service.update(ctx(), dto);

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(orgUpdate).toHaveBeenCalledWith({
                where: { id: "org_1" },
                data: { name: "Acme Global" },
            });
            expect(profileUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { organizationId: "org_1" },
                    update: { legalName: "Acme Global Inc" },
                }),
            );
        });

        it("upserts, so an org onboarded with a name alone can add a profile later", async () => {
            orgFindUnique.mockResolvedValue({
                id: "org_1",
                name: "Acme",
                slug: "acme",
                businessProfile: null,
            });

            const settings = await service.update(ctx(), {
                profile: { taxId: "TAX9" },
            });

            expect(profileUpsert).toHaveBeenCalledWith({
                where: { organizationId: "org_1" },
                create: { organizationId: "org_1", taxId: "TAX9" },
                update: { taxId: "TAX9" },
            });
            expect(settings.profile).toBeNull();
        });

        it("patches only the fields sent — never blanks the untouched ones", async () => {
            await service.update(ctx(), { profile: { country: "US" } });

            expect(orgUpdate).not.toHaveBeenCalled();
            expect(profileUpsert).toHaveBeenCalledWith({
                where: { organizationId: "org_1" },
                create: { organizationId: "org_1", country: "US" },
                update: { country: "US" },
            });
        });

        it("preserves an explicit empty string, which is how the UI clears a field", async () => {
            await service.update(ctx(), { profile: { taxId: "" } });

            expect(profileUpsert).toHaveBeenCalledWith(
                expect.objectContaining({ update: { taxId: "" } }),
            );
        });

        it("refuses a timezone the tz database does not know, and writes nothing", async () => {
            await expect(
                service.update(ctx(), {
                    profile: { timezone: "Mars/Olympus" },
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("keeps a real timezone", async () => {
            await service.update(ctx(), {
                profile: { timezone: "Asia/Kolkata" },
            });
            expect(profileUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: { timezone: "Asia/Kolkata" },
                }),
            );
        });

        it("writes nothing and emits no audit row when the patch is empty", async () => {
            await service.update(ctx(), {});

            expect(orgUpdate).not.toHaveBeenCalled();
            expect(profileUpsert).not.toHaveBeenCalled();
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(record).not.toHaveBeenCalled();
        });

        it("audits the changed field NAMES only — never the PII values", async () => {
            await service.update(ctx(), {
                name: "Acme Global",
                profile: { taxId: "SECRET-TAX", contactEmail: "cfo@acme.test" },
            });

            expect(record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: AuditAction.ProfileUpdate,
                    actorUserId: "user_1",
                    organizationId: "org_1",
                    metadata: { fields: ["name", "taxId", "contactEmail"] },
                }),
            );
            const audited = JSON.stringify(record.mock.calls[0][0]);
            expect(audited).not.toContain("SECRET-TAX");
            expect(audited).not.toContain("cfo@acme.test");
        });

        describe("GST (ADR-008)", () => {
            it("registers with a valid GSTIN, taking the state from it", async () => {
                await service.update(ctx("ADMIN"), {
                    profile: { taxId: "29AAGCR4375J1ZU" },
                    tax: { registered: true, invoicePrefix: "rc" },
                    registeredAddress: {
                        line1: "14 Hill Road",
                        city: "Bengaluru",
                        postalCode: "560 038",
                    },
                });
                expect(profileUpsert).toHaveBeenCalledWith(
                    expect.objectContaining({
                        update: {
                            taxId: "29AAGCR4375J1ZU",
                            addressLine1: "14 Hill Road",
                            city: "Bengaluru",
                            postalCode: "560038",
                            gstRegistered: true,
                            gstState: "29",
                            invoicePrefix: "RC",
                        },
                    }),
                );
            });

            it("refuses registering without a registered address, on the missing field", async () => {
                const attempt = service.update(ctx(), {
                    profile: { taxId: "29AAGCR4375J1ZU" },
                    tax: { registered: true },
                });
                await expect(attempt).rejects.toBeInstanceOf(
                    BadRequestException,
                );
                await expect(attempt).rejects.toMatchObject({
                    response: { details: { field: "addressLine1" } },
                });
                await expect(
                    service.update(ctx(), {
                        profile: { taxId: "29AAGCR4375J1ZU" },
                        tax: { registered: true },
                        registeredAddress: {
                            line1: "14 Hill Road",
                            postalCode: "560038",
                        },
                    }),
                ).rejects.toMatchObject({
                    response: { details: { field: "city" } },
                });
                expect(prisma.$transaction).not.toHaveBeenCalled();
            });

            it("refuses clearing the address of a registered business", async () => {
                profileFindUnique.mockResolvedValue({
                    gstRegistered: true,
                    gstState: "29",
                    taxId: "29AAGCR4375J1ZU",
                    country: "IN",
                    addressLine1: "14 Hill Road",
                    addressLine2: null,
                    city: "Bengaluru",
                    postalCode: "560038",
                });
                await expect(
                    service.update(ctx(), {
                        registeredAddress: { postalCode: "" },
                    }),
                ).rejects.toMatchObject({
                    response: { details: { field: "postalCode" } },
                });
                expect(profileUpsert).not.toHaveBeenCalled();
            });

            it("refuses a PIN that is not six digits for an Indian business", async () => {
                profileFindUnique.mockResolvedValue({
                    gstRegistered: false,
                    gstState: null,
                    taxId: null,
                    country: "IN",
                    addressLine1: null,
                    addressLine2: null,
                    city: null,
                    postalCode: null,
                });
                for (const postalCode of [
                    "56003",
                    "5600381",
                    "056003",
                    "SW1A 1AA",
                ]) {
                    await expect(
                        service.update(ctx(), {
                            registeredAddress: {
                                line1: "14 Hill Road",
                                city: "Bengaluru",
                                postalCode,
                            },
                        }),
                    ).rejects.toMatchObject({
                        response: { details: { field: "postalCode" } },
                    });
                }
                expect(profileUpsert).not.toHaveBeenCalled();
            });

            it("keeps any postal code for a business outside India, unregistered", async () => {
                profileFindUnique.mockResolvedValue({
                    gstRegistered: false,
                    gstState: null,
                    taxId: null,
                    country: "GB",
                    addressLine1: null,
                    addressLine2: null,
                    city: null,
                    postalCode: null,
                });
                await service.update(ctx(), {
                    registeredAddress: {
                        line1: "1 Mall",
                        line2: "",
                        city: "London",
                        postalCode: "SW1A 1AA",
                    },
                });
                expect(profileUpsert).toHaveBeenCalledWith(
                    expect.objectContaining({
                        update: {
                            addressLine1: "1 Mall",
                            addressLine2: null,
                            city: "London",
                            postalCode: "SW1A 1AA",
                        },
                    }),
                );
            });

            it("refuses an invalid GSTIN on save, and writes nothing", async () => {
                const attempt = service.update(ctx(), {
                    profile: { taxId: "29AAGCR4375J1ZX" },
                    tax: { registered: true },
                });
                await expect(attempt).rejects.toBeInstanceOf(
                    BadRequestException,
                );
                await expect(attempt).rejects.toMatchObject({
                    response: { details: { field: "taxId" } },
                });
                expect(prisma.$transaction).not.toHaveBeenCalled();
            });

            it("refuses a GSTIN from another state than the one chosen", async () => {
                await expect(
                    service.update(ctx(), {
                        profile: { taxId: "30AAACR5055K1ZK" },
                        tax: { registered: true, state: "Karnataka" },
                    }),
                ).rejects.toThrow(/registered in Goa/);
            });

            it("refuses a state that is not one", async () => {
                await expect(
                    service.update(ctx(), { tax: { state: "Atlantis" } }),
                ).rejects.toBeInstanceOf(BadRequestException);
            });

            it("refuses registering with no GSTIN, and clearing it once registered", async () => {
                await expect(
                    service.update(ctx(), { tax: { registered: true } }),
                ).rejects.toThrow(/GSTIN/);
                profileFindUnique.mockResolvedValue({
                    gstRegistered: true,
                    gstState: "29",
                    taxId: "29AAGCR4375J1ZU",
                });
                await expect(
                    service.update(ctx(), { profile: { taxId: "" } }),
                ).rejects.toThrow(/GSTIN/);
            });

            it("refuses a prefix that would make numbers too long, and a rate GST has not", async () => {
                await expect(
                    service.update(ctx(), { tax: { invoicePrefix: "RYEC" } }),
                ).rejects.toMatchObject({
                    response: { details: { field: "invoicePrefix" } },
                });
                await expect(
                    service.update(ctx(), { tax: { deliveryRate: "7" } }),
                ).rejects.toMatchObject({
                    response: { details: { field: "deliveryRate" } },
                });
            });

            it("tax settings are Owner/Admin: a Member is refused", async () => {
                await expect(
                    service.update(ctx("MEMBER"), {
                        tax: { registered: false },
                    }),
                ).rejects.toBeInstanceOf(ForbiddenException);
                expect(profileUpsert).not.toHaveBeenCalled();
            });

            it("reads the tax settings back apart from the profile", async () => {
                orgFindUnique.mockResolvedValue({
                    id: "org_1",
                    name: "Rye & Co.",
                    slug: "rye",
                    businessProfile: {
                        legalName: null,
                        type: null,
                        country: "IN",
                        taxId: "29AAGCR4375J1ZU",
                        contactEmail: null,
                        website: null,
                        timezone: "Asia/Kolkata",
                        gstRegistered: true,
                        gstState: "29",
                        invoicePrefix: "RC",
                        deliveryGstRate: { toString: () => "18.00" },
                        deliverySacCode: "996813",
                        addressLine1: "14 Hill Road",
                        addressLine2: "Indiranagar",
                        city: "Bengaluru",
                        postalCode: "560038",
                    },
                });
                const settings = await service.get(ctx());
                expect(settings.registeredAddress).toEqual({
                    line1: "14 Hill Road",
                    line2: "Indiranagar",
                    city: "Bengaluru",
                    postalCode: "560038",
                    state: "29",
                    stateName: "Karnataka",
                });
                expect(settings.profile).not.toHaveProperty("addressLine1");
                expect(settings.tax).toEqual({
                    registered: true,
                    state: "29",
                    stateName: "Karnataka",
                    invoicePrefix: "RC",
                    deliveryRate: "18",
                    deliverySac: "996813",
                });
                expect(settings.profile).not.toHaveProperty("gstRegistered");
            });
        });

        it("never re-slugs on rename — the slug is the stable public identifier", async () => {
            await service.update(ctx(), { name: "Totally Different Name" });

            expect(orgUpdate).toHaveBeenCalledWith({
                where: { id: "org_1" },
                data: { name: "Totally Different Name" },
            });
            const written = orgUpdate.mock.calls[0][0] as { data: object };
            expect(written.data).not.toHaveProperty("slug");
        });
    });

    describe("logo", () => {
        const png = {
            id: "media_1",
            url: "https://media.saroh.test/org/org_1/business-logo/a.png",
            contentType: "image/png",
            sizeBytes: 40_000,
        };

        it("sets a ready library image as the logo, and reads it back", async () => {
            readyObject.mockResolvedValue(png);
            orgFindUnique.mockResolvedValue({
                id: "org_1",
                name: "Acme",
                slug: "acme",
                businessProfile: {
                    legalName: null,
                    deliveryGstRate: { toString: () => "18.00" },
                    logoMediaId: "media_1",
                    logoUrl: png.url,
                },
            });

            const settings = await service.setLogo(ctx("ADMIN"), "media_1");

            // Tenant-scoped: the library answers for this business only.
            expect(readyObject).toHaveBeenCalledWith("org_1", "media_1");
            expect(profileUpsert).toHaveBeenCalledWith({
                where: { organizationId: "org_1" },
                create: {
                    organizationId: "org_1",
                    logoMediaId: "media_1",
                    logoUrl: png.url,
                },
                update: { logoMediaId: "media_1", logoUrl: png.url },
            });
            expect(settings.logo).toEqual({ url: png.url, mediaId: "media_1" });
            expect(settings.profile).not.toHaveProperty("logoUrl");
            expect(record).toHaveBeenCalledWith(
                expect.objectContaining({ metadata: { fields: ["logo"] } }),
            );
        });

        it("refuses an SVG, and an image of 1 MB or more", async () => {
            readyObject.mockResolvedValueOnce({
                ...png,
                contentType: "image/svg+xml",
            });
            await expect(service.setLogo(ctx(), "media_1")).rejects.toThrow(
                /PNG, JPG or WebP/,
            );
            readyObject.mockResolvedValueOnce({
                ...png,
                sizeBytes: 1024 * 1024 + 1,
            });
            await expect(service.setLogo(ctx(), "media_1")).rejects.toThrow(
                /under 1 MB/,
            );
            expect(profileUpsert).not.toHaveBeenCalled();
        });

        it("refuses an image storage cannot serve", async () => {
            readyObject.mockResolvedValueOnce({ ...png, url: null });
            await expect(
                service.setLogo(ctx(), "media_1"),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(profileUpsert).not.toHaveBeenCalled();
        });

        it("is Owner/Admin: a Member can neither set nor remove it", async () => {
            await expect(
                service.setLogo(ctx("MEMBER"), "media_1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.removeLogo(ctx("MEMBER")),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(readyObject).not.toHaveBeenCalled();
            expect(profileUpsert).not.toHaveBeenCalled();
            expect(profileUpdateMany).not.toHaveBeenCalled();
        });

        it("removes it, leaving the image in the library", async () => {
            profileUpdateMany.mockResolvedValue({ count: 1 });
            const settings = await service.removeLogo(ctx());
            expect(profileUpdateMany).toHaveBeenCalledWith({
                where: { organizationId: "org_1", logoUrl: { not: null } },
                data: { logoMediaId: null, logoUrl: null },
            });
            expect(settings.logo).toBeNull();
            expect(record).toHaveBeenCalledTimes(1);
        });

        it("removing when there is none writes no audit row", async () => {
            profileUpdateMany.mockResolvedValue({ count: 0 });
            await service.removeLogo(ctx());
            expect(record).not.toHaveBeenCalled();
        });
    });

    // Pre-flight for account deletion. The authoritative refusal is the
    // beforeDelete hook in @saroh/auth; this only lets the UI say it earlier.
    describe("listSoleOwned", () => {
        const owned = [
            {
                organizationId: "org_1",
                organization: { id: "org_1", name: "Acme", slug: "acme" },
            },
            {
                organizationId: "org_2",
                organization: { id: "org_2", name: "Solo", slug: "solo" },
            },
        ];

        it("returns only orgs with no OTHER owner", async () => {
            membershipFindMany.mockResolvedValue(owned);
            // org_1 has a co-owner; org_2 does not.
            membershipCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

            expect(await service.listSoleOwned("user_1")).toEqual([
                { id: "org_2", name: "Solo", slug: "solo" },
            ]);
        });

        it("excludes the user themself when counting co-owners", async () => {
            membershipFindMany.mockResolvedValue([owned[0]]);
            membershipCount.mockResolvedValue(0);

            await service.listSoleOwned("user_1");

            expect(membershipCount).toHaveBeenCalledWith({
                where: {
                    organizationId: "org_1",
                    role: "OWNER",
                    userId: { not: "user_1" },
                },
            });
        });

        it("returns nothing when the user owns no organization", async () => {
            membershipFindMany.mockResolvedValue([]);

            expect(await service.listSoleOwned("user_1")).toEqual([]);
            expect(membershipCount).not.toHaveBeenCalled();
        });
    });
});

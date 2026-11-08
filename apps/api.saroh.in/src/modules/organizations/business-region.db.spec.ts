/**
 * A business's own address by its country (U3, KTD-A, KTD-B) against a real
 * Postgres: a Global business's region saves through the settings PATCH,
 * reads back beside the address, and counts toward the details every
 * invoice needs; a postcode or region that doesn't fit the country is
 * refused on its field. An Indian business never stores one.
 *
 * Runs in the integration project (TEST_DATABASE_URL). Made-up addresses.
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { missingBusinessDetails } from "../invoices/business-details";
import type { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "./organization-settings.service";

const settings = new OrganizationSettingsService(
    new AuditService(),
    {} as MediaService,
);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function business(
    edition: "INDIA" | "GLOBAL",
    country: string,
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: {
            name: "Northwind Supply",
            slug: uniq("u3-org-"),
            edition,
            businessProfile: { create: { country } },
        },
    });
    return {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
        edition,
    };
}

const refusal = async (p: Promise<unknown>) =>
    p.then(
        () => {
            throw new Error("not refused");
        },
        (e: { getResponse(): unknown }) => e.getResponse(),
    );

describe("a business's own address by its country (real database, U3)", () => {
    it("a US business: refused with an Indian PIN and no state, saved with its state", async () => {
        const ctx = await business("GLOBAL", "US");
        expect(
            await refusal(
                settings.update(ctx, {
                    registeredAddress: {
                        line1: "1 Main St",
                        city: "New Delhi",
                        postalCode: "110001",
                    },
                }),
            ),
        ).toMatchObject({ details: { field: "postalCode" } });
        expect(
            await missingBusinessDetails(prisma, ctx.organizationId),
        ).toEqual(["address"]);

        const saved = await settings.update(ctx, {
            registeredAddress: {
                line1: "500 Congress Ave",
                city: "Austin",
                postalCode: "78701",
                region: "texas",
            },
        });
        expect(saved.registeredAddress).toMatchObject({
            postalCode: "78701",
            region: "TX",
            state: null,
        });
        expect(
            await missingBusinessDetails(prisma, ctx.organizationId),
        ).toEqual([]);

        // Clearing the state leaves the address short again.
        expect(
            await refusal(
                settings.update(ctx, { registeredAddress: { region: "" } }),
            ),
        ).toMatchObject({
            message: "Choose your state.",
            details: { field: "region" },
        });
    });

    it("a UK business saves with no region", async () => {
        const ctx = await business("GLOBAL", "GB");
        const saved = await settings.update(ctx, {
            registeredAddress: {
                line1: "1 High St",
                city: "London",
                postalCode: "sw1a1aa",
            },
        });
        expect(saved.registeredAddress).toMatchObject({
            postalCode: "SW1A 1AA",
            region: null,
        });
        expect(
            await missingBusinessDetails(prisma, ctx.organizationId),
        ).toEqual([]);
    });

    it("an Indian business never stores a region, and its address saves as before", async () => {
        const ctx = await business("INDIA", "IN");
        expect(
            await refusal(
                settings.update(ctx, {
                    registeredAddress: { region: "KA" },
                }),
            ),
        ).toMatchObject({ details: { field: "region" } });
        const saved = await settings.update(ctx, {
            registeredAddress: {
                line1: "3 Hill Road",
                city: "Bengaluru",
                postalCode: "560 038",
            },
            tax: { state: "29" },
        });
        expect(saved.registeredAddress).toEqual({
            line1: "3 Hill Road",
            line2: null,
            city: "Bengaluru",
            postalCode: "560038",
            state: "29",
            stateName: "Karnataka",
            region: null,
        });
    });
});

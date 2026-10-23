/**
 * 1.5% is a rate GST has (DEC-176, #1160), against a real Postgres: a
 * product saved at 1.5% reads back as 1.5, through its editor and through
 * the rates sheet, and an invoice line at 1.5% is frozen at 1.5 with its
 * GST split CGST + SGST. 1.4% is still refused.
 *
 * The sums. The business is in Karnataka (29) and so is the customer, so
 * a line's GST is split in two:
 *
 *   diamonds ₹1,015 including 1.5% → ₹1,000 + CGST ₹7.50 + SGST ₹7.50
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { GstRatesService } from "./gst-rates.service";
import { InvoicesService } from "./invoices.service";

const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const rates = new GstRatesService();
const invoices = new InvoicesService();

let owner: OrganizationContext;
let ownerId = "";
let storeId = "";
let contactId = "";

const rateOf = async (id: string) =>
    (
        await prisma.product.findUniqueOrThrow({
            where: { id },
            select: { gstRate: true },
        })
    ).gstRate?.toString();

/** What a refused write said. */
async function refusal(write: Promise<unknown>): Promise<string> {
    const error: unknown = await write.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string })
        .message;
}

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `gst-1-5-${tag}@example.com` },
        })
    ).id;
    const org = await prisma.organization.create({
        data: { name: "Facet Diamonds", slug: `gst-1-5-${tag}` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId: ownerId, role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            taxId: "29AAGCR4375J1ZU",
            gstRegistered: true,
            gstState: "29",
            timezone: "UTC",
        },
    });
    await giveBusinessDetails(org.id);
    storeId = (
        await stores.createForUser(ownerId, org.id, {
            name: "Facet",
            slug: `gst-1-5-store-${tag}`,
        })
    ).id;
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: `asha-${tag}@example.com`,
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
});

describe("1.5% on a product (real database)", () => {
    it("saves 1.5 from the product's editor and reads it back as 1.5", async () => {
        const ring = await products.create(storeId, ownerId, {
            name: "Solitaire, cut and polished",
            price: "1015",
            gstRate: "1.5",
        });
        expect(await rateOf(ring.id)).toBe("1.5");

        await products.patch(storeId, ring.id, ownerId, { gstRate: "18" });
        await products.patch(storeId, ring.id, ownerId, { gstRate: "1.50" });
        expect(await rateOf(ring.id)).toBe("1.5");
    });

    it("saves 1.5 from the rates sheet, and still refuses 1.4", async () => {
        const stud = await products.create(storeId, ownerId, {
            name: "Diamond stud",
            price: "2030",
        });
        await rates.set(owner, {
            items: [{ kind: "PRODUCT", id: stud.id, rate: "1.50" }],
        });
        expect(await rateOf(stud.id)).toBe("1.5");

        expect(
            await refusal(
                rates.set(owner, {
                    items: [{ kind: "PRODUCT", id: stud.id, rate: "1.4" }],
                }),
            ),
        ).toBe(
            "1.4% is not a GST rate. Use 0, 0.25, 1.5, 3, 5, 12, 18, 28 or 40.",
        );
        expect(
            await refusal(
                products.create(storeId, ownerId, {
                    name: "Not a rate",
                    price: "100",
                    gstRate: "1.4",
                }),
            ),
        ).toContain("1.4% is not a GST rate");
        expect(await rateOf(stud.id)).toBe("1.5");
    });
});

describe("1.5% on an invoice line (real database)", () => {
    it("freezes the line at 1.5 and splits ₹15 of GST into CGST and SGST", async () => {
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: [
                {
                    description: "Cut and polished diamond",
                    quantity: 1,
                    unitPrice: "1015",
                    gstRate: "1.5",
                    hsnSac: "71023910",
                },
            ],
        });
        await invoices.issue(owner, draft.id);

        const line = await prisma.invoiceLine.findFirstOrThrow({
            where: { invoiceId: draft.id },
        });
        expect(line.gstRate?.toString()).toBe("1.5");
        expect(line.taxableValue?.toString()).toBe("1000");
        expect(line.cgst.toString()).toBe("7.5");
        expect(line.sgst.toString()).toBe("7.5");
        expect(line.igst.toString()).toBe("0");
        expect(line.amount.toString()).toBe("1015");
    });

    it("refuses a line at 1.4%", async () => {
        expect(
            await refusal(
                invoices.createDraft(owner, {
                    contactId,
                    currency: "INR",
                    lines: [
                        {
                            description: "Not a rate",
                            quantity: 1,
                            unitPrice: "100",
                            gstRate: "1.4",
                        },
                    ],
                }),
            ),
        ).toContain("1.4% is not a GST rate");
    });
});

/**
 * The customer permissions matrix (round-2 C13, DEC-039; permission matrix
 * §2 and §3) against a real Postgres: every customer endpoint asks its own
 * power, and each customer row of the matrix is backed by a refusal here.
 *
 * | Endpoint                                        | Asks                                  |
 * | ----------------------------------------------- | ------------------------------------- |
 * | GET customers, :id/detail, contacts/search      | `contact:read`                        |
 * | GET :id/attention                               | `contact:read`; sensitive entries     |
 * |                                                 | only with `customer:sensitive`        |
 * | POST :id/notes, :id/attention; DELETE contact   | `contact:write` (+ `customer:sensitive` |
 * |                                                 | for a sensitive entry)                |
 * | GET/POST :id/merge/:other(/preview)             | `customer:merge`                      |
 * | GET/POST :id/removal(/preview)                  | `customer:remove`                     |
 *
 * Roles are the business's own (stored rows, resolved with their implied
 * holds). Only the app env is stubbed. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
    declaredNodeEnv: "test",
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ContactsService } from "../contacts/contacts.service";
import type { OrgAction } from "../organizations/organization-policy";
import { resolveCapabilities } from "../organizations/organization-policy";
import { ContactAttentionService } from "./contact-attention.service";
import { ContactNotesService } from "./contact-notes.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomersListService } from "./customers-list.service";
import { MergeService } from "./merge.service";
import { PrivacyRemovalService } from "./privacy-removal.service";

const tag = `${process.pid}-${Date.now()}`;
const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;
const list = new CustomersListService();
const details = new CustomerDetailService(availability);
const attention = new ContactAttentionService();
const notes = new ContactNotesService();
const merges = new MergeService();
const removals = new PrivacyRemovalService();
const contacts = new ContactsService();

/** The business's own roles, as a custom role is stored (key → actions). */
const ROLES: Record<string, OrgAction[]> = {
    // Books patients, edits their details, reads no medical notes.
    "front-desk-c13": ["booking:write", "contact:write"],
    // Reads the diary and the medical notes, changes nothing.
    "practitioner-c13": [
        "booking:read",
        "service:read",
        "contact:read",
        "customer:sensitive",
    ],
    // Sees customers, nothing else.
    "reader-c13": ["contact:read"],
    // Saved with the write only: it implies the read.
    "editor-c13": ["contact:write"],
    // Reads orders, not invoices: no Spent.
    "orders-c13": ["contact:read", "order:read"],
    "merger-c13": ["contact:read", "customer:merge"],
    "remover-c13": ["contact:read", "customer:remove"],
    // Website only.
    "site-c13": ["site:read"],
};
type RoleKey = keyof typeof ROLES;

let orgId = "";
let ownerId = "";
let owner: OrganizationContext;
let asha = "";
let other = "";
const users: Record<string, string> = {};

function as(key: RoleKey): OrganizationContext {
    return {
        organizationId: orgId,
        userId: users[key],
        role: "MEMBER",
        roleKey: key,
        actions: resolveCapabilities(key, ROLES[key]),
    };
}

/** Refused (a 403), or let through to whatever the request itself meets. */
async function gate(run: () => unknown): Promise<"allowed" | "refused"> {
    try {
        await run();
    } catch (error) {
        if (error instanceof ForbiddenException) return "refused";
    }
    return "allowed";
}

async function freshContact(name: string): Promise<string> {
    return (
        await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `c13-${name}-${Math.random().toString(36).slice(2)}-${tag}@example.in`,
                firstName: name,
            },
        })
    ).id;
}

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `c13-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Smile Dental", slug: `c13-org-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    await prisma.organizationRole.createMany({
        data: Object.entries(ROLES).map(([key, actions]) => ({
            organizationId: orgId,
            key,
            label: key,
            actions,
        })),
    });
    for (const key of Object.keys(ROLES)) {
        users[key] = (
            await prisma.user.create({
                data: { email: `c13-${key}-${tag}@example.com` },
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: users[key], role: key },
        });
    }

    // Asha: a paid order, a paid invoice, a Medical note and an allergy.
    asha = (
        await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `c13-asha-${tag}@example.in`,
                firstName: "Asha",
                phone: "+91 98450 55555",
            },
        })
    ).id;
    const store = await prisma.store.create({
        data: {
            name: "Clinic shop",
            slug: `c13-store-${tag}`,
            organizationId: orgId,
        },
    });
    const customer = await prisma.customer.create({
        data: {
            storeId: store.id,
            organizationId: orgId,
            email: `c13-asha-${tag}@example.in`,
        },
    });
    await prisma.customerIdentityLink.create({
        data: {
            organizationId: orgId,
            contactId: asha,
            customerId: customer.id,
        },
    });
    await prisma.order.create({
        data: {
            storeId: store.id,
            organizationId: orgId,
            customerId: customer.id,
            orderId: `C13-${tag}`,
            subtotal: "600",
            shipping: "0",
            total: "600",
            currency: "INR",
            paymentStatus: "PAID",
            status: "DELIVERED",
        },
    });
    await prisma.invoice.create({
        data: {
            organizationId: orgId,
            contactId: asha,
            kind: "INVOICE",
            status: "PAID",
            number: `C13-INV-${tag}`,
            currency: "INR",
            subtotal: "900",
            total: "900",
            paidAt: new Date(),
        },
    });
    await prisma.contactAttention.createMany({
        data: [
            {
                organizationId: orgId,
                contactId: asha,
                kind: "MEDICAL",
                label: "Pregnant",
                sensitive: true,
            },
            {
                organizationId: orgId,
                contactId: asha,
                kind: "ALLERGY",
                label: "Latex",
            },
        ],
    });
    other = await freshContact("Asha R");
});

describe("seeing customers: contact:read", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["reader-c13", "allowed"],
        ["practitioner-c13", "allowed"],
        ["front-desk-c13", "allowed"],
        // Saved with the write alone: it implies the read.
        ["editor-c13", "allowed"],
        ["site-c13", "refused"],
    ])("%s → the list, detail, attention and search: %s", async (key, want) => {
        expect(await gate(() => list.list(as(key), {}))).toBe(want);
        expect(await gate(() => details.read(as(key), asha))).toBe(want);
        expect(await gate(() => attention.list(as(key), asha))).toBe(want);
        expect(await gate(() => contacts.search(as(key), "asha"))).toBe(want);
    });

    it("refuses in words, never a code", async () => {
        await expect(list.list(as("site-c13"), {})).rejects.toThrow(
            "Your role can't see customers.",
        );
    });

    it("a role with contact:read sees phone and email and finds them by either", async () => {
        const byPhone = await list.list(as("reader-c13"), { q: "98450 55555" });
        expect(byPhone.rows.map((r) => r.contactId)).toEqual([asha]);
        expect(byPhone.rows[0].email).toBe(`c13-asha-${tag}@example.in`);
        expect(byPhone.rows[0].phone).toBe("+91 98450 55555");
        const byEmail = await list.list(as("reader-c13"), {
            q: `c13-asha-${tag}`,
        });
        expect(byEmail.rows.map((r) => r.contactId)).toEqual([asha]);
        const detail = await details.detail(as("reader-c13"), asha);
        expect(detail.contact.email).toBe(`c13-asha-${tag}@example.in`);
        expect(detail.contact.phone).toBe("+91 98450 55555");
    });
});

describe("sensitive notes: customer:sensitive", () => {
    it("a Practitioner reads the Medical entry, and can't edit it", async () => {
        const read = await attention.list(as("practitioner-c13"), asha);
        expect(read.entries.map((e) => e.label).sort()).toEqual([
            "Latex",
            "Pregnant",
        ]);
        expect(read.hiddenSensitiveCount).toBe(0);
        const medical = read.entries.find((e) => e.label === "Pregnant")!;
        await expect(
            attention.update(as("practitioner-c13"), asha, medical.id, {
                label: "Due in May",
            }),
        ).rejects.toThrow("Your role can't change customers' details.");
    });

    it("a front desk that edits customers is told a note is there, not what it says", async () => {
        const read = await attention.list(as("front-desk-c13"), asha);
        expect(read.entries.map((e) => e.label)).toEqual(["Latex"]);
        expect(read.hiddenSensitiveCount).toBe(1);
        expect(JSON.stringify(read)).not.toContain("Pregnant");
        const detail = await details.detail(as("front-desk-c13"), asha);
        expect(JSON.stringify(detail)).not.toContain("Pregnant");
    });

    it("a front desk adds an entry, but not a sensitive one", async () => {
        const id = await freshContact("Ravi");
        expect(
            await gate(() =>
                attention.create(as("front-desk-c13"), id, {
                    kind: "ACCESS",
                    label: "Wheelchair",
                }),
            ),
        ).toBe("allowed");
        await expect(
            attention.create(as("front-desk-c13"), id, {
                kind: "MEDICAL",
                label: "Diabetic",
            }),
        ).rejects.toThrow("Your role can't see sensitive notes");
    });

    it("Owner and Admin read it, and a Member doesn't", async () => {
        const mine = await attention.list(owner, asha);
        expect(mine.entries).toHaveLength(2);
        const member: OrganizationContext = {
            organizationId: orgId,
            userId: users["reader-c13"],
            role: "MEMBER",
        };
        expect((await attention.list(member, asha)).hiddenSensitiveCount).toBe(
            1,
        );
    });
});

describe("editing a person: contact:write", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["front-desk-c13", "allowed"],
        ["editor-c13", "allowed"],
        ["reader-c13", "refused"],
        ["practitioner-c13", "refused"],
        ["merger-c13", "refused"],
    ])(
        "%s adds a note and hard-deletes a record with no orders: %s",
        async (key, want) => {
            expect(
                await gate(() =>
                    notes.create(as(key), asha, { body: `From ${key}` }),
                ),
            ).toBe(want);
            const spare = await freshContact("Spare");
            expect(await gate(() => contacts.remove(as(key), spare))).toBe(
                want,
            );
        },
    );
});

describe("merging: customer:merge, never implied by contact:write", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["merger-c13", "allowed"],
        ["front-desk-c13", "refused"],
        ["editor-c13", "refused"],
        ["remover-c13", "refused"],
    ])("%s: %s", async (key, want) => {
        expect(await gate(() => merges.preview(as(key), asha, other))).toBe(
            want,
        );
        if (want === "refused") {
            await expect(
                merges.merge(as(key), asha, other, {
                    survivorId: asha,
                } as never),
            ).rejects.toThrow("Your role can't merge customers.");
        }
    });
});

describe("removing their details: customer:remove, never implied by contact:write", () => {
    it.each<[RoleKey, "allowed" | "refused"]>([
        ["remover-c13", "allowed"],
        ["front-desk-c13", "refused"],
        ["editor-c13", "refused"],
        ["merger-c13", "refused"],
    ])("%s: %s", async (key, want) => {
        expect(await gate(() => removals.preview(as(key), asha))).toBe(want);
        if (want === "refused") {
            await expect(removals.remove(as(key), asha)).rejects.toThrow(
                "Your role can't remove a customer's details.",
            );
        }
    });
});

describe("each part of Customer Detail on its own read (matrix §1 rule 3)", () => {
    it("order:read without invoice:read sees the orders tab whole, and no Spent", async () => {
        const detail = await details.detail(as("orders-c13"), asha);
        expect(detail.orders?.rows).toHaveLength(1);
        expect(detail.orders?.rows[0].total).toBe("600.00");
        expect(detail.stats.orders).toBe(1);
        expect(detail.money).toBe(false);
        expect(detail.stats).not.toHaveProperty("spent");
        expect(detail).not.toHaveProperty("invoices");
    });

    it("the Owner sees Spent across orders and invoices", async () => {
        const detail = await details.detail(owner, asha);
        expect(detail.money).toBe(true);
        expect(detail.stats.spent).toEqual([
            { currency: "INR", amount: "1500.00" },
        ]);
    });

    it("the list leaves Spent out, and judges Returning from orders alone (DEC-056)", async () => {
        const page = await list.list(as("orders-c13"), {
            q: `c13-asha-${tag}`,
        });
        expect(page.sees).toEqual({
            orders: true,
            spent: false,
            subscriptions: false,
        });
        expect(page.rows[0]).not.toHaveProperty("spent");
        // One paid order: not Returning from orders alone, but Returning
        // with the paid invoice counted.
        expect(page.rows[0].returning).toBe(false);
        const mine = await list.list(owner, { q: `c13-asha-${tag}` });
        expect(mine.rows[0].returning).toBe(true);
    });
});

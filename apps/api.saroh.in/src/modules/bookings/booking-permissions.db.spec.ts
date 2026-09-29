/**
 * The bookings, services and class-packs permissions matrix (round-2 E26,
 * DEC-039; permission matrix §2) against a real Postgres: every booking,
 * service and pack endpoint asks its own power, and each row of the matrix
 * is backed by a refusal here.
 *
 * | Endpoint                                                   | Asks                          |
 * | ---------------------------------------------------------- | ----------------------------- |
 * | services, rules, availability, staff, closures, rules (GET) | `service:read`               |
 * | the same, changed; hours, time off, booking rules          | `service:write`               |
 * | the diary, a booking, a class's waitlist                   | `booking:read`                |
 * | book, move, outcome, cancel, a treatment's visit           | `booking:write`               |
 * | a booking's pay link                                       | `booking:write`, `invoice:write` |
 * | packs, selling terms, Pack Detail's tabs, purchases        | `pack:read`                   |
 * | sell a pack                                                | `pack:sell`                   |
 * | book with a pack; use one on a booking, or take it off     | `pack:sell`, `booking:write`  |
 * | make, edit, publish, archive, restore, extend a pack       | `pack:write`                  |
 *
 * Roles are the business's own (stored rows, resolved with their implied
 * holds). The holds each role should end up with are written out below
 * independently of `resolveCapabilities`, so the implied holds are pinned
 * too. Runs in the integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ClassPacksService } from "../class-packs/class-packs.service";
import { InvoicesService } from "../invoices/invoices.service";
import type { OrgAction } from "../organizations/organization-policy";
import { resolveCapabilities } from "../organizations/organization-policy";
import { ClosuresService } from "../staff/closures.service";
import { StaffService } from "../staff/staff.service";
import { BookingsService } from "./bookings.service";
import { WaitlistService } from "./waitlist.service";

const tag = `${process.pid}-${Date.now()}`;
const bookings = new BookingsService();
const staff = new StaffService();
const closures = new ClosuresService();
const waitlist = new WaitlistService();
const packs = new ClassPacksService(new InvoicesService());

/** The business's own roles, as a custom role is stored (key → actions). */
const ROLES: Record<string, OrgAction[]> = {
    // The matrix's Front desk template: books, sells packs, no set-up.
    "desk-e26": ["booking:write", "contact:read", "pack:sell"],
    // Sells a pack at the desk, and nothing else.
    "seller-e26": ["pack:sell"],
    // Saved with pack:write before pack:sell existed.
    "packs-lead-e26": ["pack:write"],
    // Reads packs whole, money included.
    "pack-reader-e26": ["pack:read"],
    // Sets up services, hours and rules; saved without the read.
    "setup-e26": ["service:write"],
    // A practitioner: sees the diary.
    "diary-e26": ["booking:read", "service:read"],
    // Can send a booking's pay link.
    "cashier-e26": ["booking:write", "invoice:write"],
    // Website only.
    "site-e26": ["site:read"],
};
type RoleKey = keyof typeof ROLES;

/** What each role holds once implied holds are added — written out by hand. */
const HOLDS: Record<RoleKey, OrgAction[]> = {
    "desk-e26": [
        "booking:write",
        "booking:read",
        "contact:read",
        "pack:sell",
        "pack:read",
    ],
    "seller-e26": ["pack:sell", "pack:read"],
    "packs-lead-e26": ["pack:write", "pack:sell", "pack:read"],
    "pack-reader-e26": ["pack:read"],
    "setup-e26": ["service:write", "service:read"],
    "diary-e26": ["booking:read", "service:read"],
    "cashier-e26": ["booking:write", "booking:read", "invoice:write"],
    "site-e26": ["site:read"],
};

let orgId = "";
let owner: OrganizationContext;
let serviceId = "";
let packId = "";
let contactId = "";
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

const MISSING = "missing-e26";
const FROM = "2026-10-01T00:00:00.000Z";
const TO = "2026-10-02T00:00:00.000Z";

/**
 * One row per endpoint: what it asks, and the call the controller makes.
 * Ids that don't exist, so a request let through meets a 404 or a 400 and
 * changes nothing.
 */
const ENDPOINTS: [
    string,
    OrgAction[],
    (ctx: OrganizationContext) => unknown,
][] = [
    // — Services, staff, closures and booking rules ————————————————
    ["GET services", ["service:read"], (c) => bookings.listServices(c)],
    [
        "GET services/:id",
        ["service:read"],
        (c) => bookings.getService(c, MISSING),
    ],
    [
        "GET services/:id/rules",
        ["service:read"],
        (c) => bookings.listRules(c, MISSING),
    ],
    [
        "GET services/:id/availability",
        ["service:read"],
        (c) => bookings.availability(c, MISSING, FROM, TO),
    ],
    ["GET staff", ["service:read"], (c) => staff.list(c)],
    ["GET staff/:id", ["service:read"], (c) => staff.get(c, MISSING)],
    ["GET booking-rules", ["service:read"], (c) => staff.getBookingRules(c)],
    ["GET closures", ["service:read"], (c) => closures.list(c)],
    [
        "POST services",
        ["service:write"],
        (c) => bookings.createService(c, {} as never),
    ],
    [
        "PATCH services/:id",
        ["service:write"],
        (c) => bookings.updateService(c, MISSING, {} as never),
    ],
    [
        "DELETE services/:id",
        ["service:write"],
        (c) => bookings.removeService(c, MISSING),
    ],
    [
        "PUT services/:id/rules",
        ["service:write"],
        (c) => bookings.replaceRules(c, MISSING, []),
    ],
    [
        "POST services/:id/rules",
        ["service:write"],
        (c) => bookings.addRule(c, MISSING, {} as never),
    ],
    [
        "DELETE services/:id/rules/:ruleId",
        ["service:write"],
        (c) => bookings.deleteRule(c, MISSING, MISSING),
    ],
    ["POST staff", ["service:write"], (c) => staff.create(c, {} as never)],
    [
        "PATCH staff/:id",
        ["service:write"],
        (c) => staff.update(c, MISSING, {} as never),
    ],
    ["DELETE staff/:id", ["service:write"], (c) => staff.archive(c, MISSING)],
    [
        "PUT staff/:id/services",
        ["service:write"],
        (c) => staff.setServices(c, MISSING, []),
    ],
    [
        "PUT staff/:id/hours",
        ["service:write"],
        (c) => staff.replaceHours(c, MISSING, []),
    ],
    [
        "POST staff/:id/extra-hours",
        ["service:write"],
        (c) => staff.addExtraHours(c, MISSING, {} as never),
    ],
    [
        "DELETE staff/:id/extra-hours/:id",
        ["service:write"],
        (c) => staff.removeExtraHours(c, MISSING, MISSING),
    ],
    [
        "POST staff/:id/time-off",
        ["service:write"],
        (c) => staff.addTimeOff(c, MISSING, {} as never),
    ],
    [
        "POST staff/:id/time-off/remove",
        ["service:write"],
        (c) => staff.removeTimeOffMany(c, MISSING, []),
    ],
    [
        "DELETE staff/:id/time-off/:id",
        ["service:write"],
        (c) => staff.removeTimeOff(c, MISSING, MISSING),
    ],
    [
        "PUT booking-rules",
        ["service:write"],
        (c) => staff.updateBookingRules(c, {} as never),
    ],
    ["POST closures", ["service:write"], (c) => closures.add(c, {} as never)],
    ["POST closures/remove", ["service:write"], (c) => closures.remove(c, [])],
    [
        "POST time-off/preview",
        ["service:write"],
        (c) => closures.preview(c, {} as never),
    ],

    // — Bookings ——————————————————————————————————————————————
    [
        "GET services/bookings",
        ["booking:read"],
        (c) => bookings.calendarBookings(c, { from: FROM, to: TO } as never),
    ],
    [
        "GET services/:id/bookings",
        ["booking:read"],
        (c) => bookings.listBookings(c, MISSING),
    ],
    [
        "GET services/bookings/:id",
        ["booking:read"],
        (c) => bookings.getBooking(c, MISSING),
    ],
    [
        "GET services/:id/waitlist",
        ["booking:read"],
        (c) => waitlist.roster(c, MISSING, FROM),
    ],
    [
        "POST services/:id/bookings",
        ["booking:write"],
        (c) => bookings.bookByHand(c, MISSING, { startAt: FROM } as never),
    ],
    [
        "PATCH services/bookings/:id",
        ["booking:write"],
        (c) =>
            bookings.rescheduleBooking(c, MISSING, {
                startAt: FROM,
            } as never),
    ],
    [
        "POST services/bookings/:id/outcome",
        ["booking:write"],
        (c) => bookings.recordOutcome(c, MISSING, "SHOWED" as never),
    ],
    [
        "DELETE services/bookings/:id",
        ["booking:write"],
        (c) => bookings.cancelBooking(c, MISSING),
    ],
    [
        "POST services/treatments/:id/visits",
        ["booking:write"],
        (c) => bookings.bookVisit(c, MISSING, {} as never),
    ],
    [
        "POST services/bookings/:id/pay-link",
        ["booking:write", "invoice:write"],
        (c) => bookings.payLink(c, MISSING),
    ],

    // — Class packs ————————————————————————————————————————————
    ["GET class-packs", ["pack:read"], (c) => packs.listPacks(c, {})],
    ["GET class-packs/selling", ["pack:read"], (c) => packs.sellingTerms(c)],
    [
        "GET class-packs/purchases",
        ["pack:read"],
        (c) => packs.listPurchases(c, {}),
    ],
    [
        "GET class-packs/purchases/:id",
        ["pack:read"],
        (c) => packs.getPurchase(c, MISSING),
    ],
    ["GET class-packs/:id", ["pack:read"], (c) => packs.getPack(c, MISSING)],
    [
        "GET class-packs/:id/holders",
        ["pack:read"],
        (c) => packs.listHolders(c, MISSING),
    ],
    [
        "GET class-packs/:id/used",
        ["pack:read"],
        (c) => packs.listUsed(c, MISSING, {}),
    ],
    [
        "GET class-packs/:id/sales",
        ["pack:read"],
        (c) => packs.listSales(c, MISSING),
    ],
    [
        "GET class-packs/:id/events",
        ["pack:read"],
        (c) => packs.listEvents(c, MISSING, {}),
    ],
    [
        "GET class-packs/:id/draft",
        ["pack:read"],
        (c) => packs.getPackEditor(c, MISSING),
    ],
    [
        "POST class-packs/:id/sell",
        ["pack:sell"],
        (c) => packs.sell(c, MISSING, { contactId: MISSING }),
    ],
    [
        "POST services/:id/bookings with a pack",
        ["booking:write", "pack:sell"],
        (c) =>
            bookings.bookByHand(c, MISSING, {
                startAt: FROM,
                useClassPack: true,
            } as never),
    ],
    [
        "POST bookings/:id/class-pack",
        ["booking:write", "pack:sell"],
        (c) =>
            packs.useOnBooking(c, MISSING, {
                packPurchaseId: MISSING,
            } as never),
    ],
    [
        "DELETE bookings/:id/class-pack",
        ["booking:write", "pack:sell"],
        (c) => packs.removeFromBooking(c, MISSING),
    ],
    [
        "POST class-packs",
        ["pack:write"],
        (c) => packs.createPack(c, {} as never),
    ],
    [
        "POST class-packs/drafts",
        ["pack:write"],
        (c) => packs.createPackDraft(c, {} as never),
    ],
    [
        "PATCH class-packs/:id/draft",
        ["pack:write"],
        (c) => packs.savePackDraft(c, MISSING, {} as never),
    ],
    [
        "POST class-packs/:id/publish",
        ["pack:write"],
        (c) => packs.publishPack(c, MISSING, 0),
    ],
    [
        "POST class-packs/:id/discard",
        ["pack:write"],
        (c) => packs.discardPackChanges(c, MISSING, 0),
    ],
    [
        "DELETE class-packs/:id",
        ["pack:write"],
        (c) => packs.deletePackDraft(c, MISSING, 0),
    ],
    [
        "PATCH class-packs/:id",
        ["pack:write"],
        (c) => packs.updatePack(c, MISSING, {} as never),
    ],
    [
        "POST class-packs/:id/archive",
        ["pack:write"],
        (c) => packs.setPackStatus(c, MISSING, "ARCHIVED"),
    ],
    [
        "POST class-packs/:id/restore",
        ["pack:write"],
        (c) => packs.setPackStatus(c, MISSING, "ACTIVE"),
    ],
    [
        "POST class-packs/purchases/:id/extend",
        ["pack:write"],
        (c) => packs.extend(c, MISSING, { days: 7, reason: "e26" }),
    ],
];

beforeAll(async () => {
    const ownerId = (
        await prisma.user.create({
            data: { email: `e26-owner-${tag}@example.com`, name: "Neha" },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Pulse Studio", slug: `e26-org-${tag}` },
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
                data: { email: `e26-${key}-${tag}@example.com`, name: key },
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: users[key], role: key },
        });
    }
    serviceId = (
        await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "HIIT",
                durationMinutes: 60,
                capacity: 20,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;
    packId = (
        await packs.createPack(owner, {
            name: "Ten classes",
            credits: 10,
            validityDays: 90,
            price: "4500",
            currency: "INR",
            serviceIds: [serviceId],
        })
    ).id;
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `e26-asha-${tag}@example.in`,
                firstName: "Asha",
            },
        })
    ).id;
});

describe("the booking and class-pack permissions matrix (E26)", () => {
    const cases = Object.keys(ROLES).flatMap((key) =>
        ENDPOINTS.map(
            ([label, needs, run]) =>
                [key as RoleKey, label, needs, run] as const,
        ),
    );

    it.each(cases)("%s: %s", async (key, _label, needs, run) => {
        const held = new Set(HOLDS[key]);
        const want = needs.every((a) => held.has(a)) ? "allowed" : "refused";
        expect(await gate(() => run(as(key)))).toBe(want);
    });

    it("resolves each role to exactly the holds written out above", () => {
        for (const key of Object.keys(ROLES) as RoleKey[]) {
            expect([...resolveCapabilities(key, ROLES[key])].sort()).toEqual(
                [...HOLDS[key]].sort(),
            );
        }
    });
});

describe("selling a pack (E26)", () => {
    it("a role with pack:sell only sells, and can't edit the pack", async () => {
        const sold = await packs.sell(as("seller-e26"), packId, {
            contactId,
            paidBy: "CASH",
        });
        expect(sold).toMatchObject({ contact: { id: contactId }, left: 10 });
        await expect(
            packs.updatePack(as("seller-e26"), packId, {
                name: "Cheaper",
                credits: 10,
                validityDays: 90,
                price: "100",
                currency: "INR",
                serviceIds: [serviceId],
            }),
        ).rejects.toThrow("Your role can't change class packs.");
        const pack = await prisma.classPack.findUniqueOrThrow({
            where: { id: packId },
            select: { name: true },
        });
        expect(pack.name).toBe("Ten classes");
    });

    it("a role saved with pack:write before the split still sells", async () => {
        const sold = await packs.sell(as("packs-lead-e26"), packId, {
            contactId,
            paidBy: "UPI",
        });
        expect(sold).toMatchObject({ contact: { id: contactId } });
    });

    it("a role with pack:read sees Pack Detail's Sales, amounts included", async () => {
        const sales = await packs.listSales(as("pack-reader-e26"), packId);
        expect(sales.length).toBeGreaterThanOrEqual(2);
        for (const sale of sales) {
            expect(sale).toMatchObject({ price: "4500.00", currency: "INR" });
        }
    });

    it("a role that can't sell is refused in words, never with a code", async () => {
        await expect(
            packs.sell(as("pack-reader-e26"), packId, { contactId }),
        ).rejects.toThrow("Your role can't sell class packs.");
        await expect(
            packs.sell(as("pack-reader-e26"), packId, { contactId }),
        ).rejects.not.toThrow(/pack:|may not perform/);
    });

    it("booking with a pack without pack:sell says what's missing", async () => {
        await expect(
            bookings.bookByHand(as("cashier-e26"), serviceId, {
                startAt: FROM,
                useClassPack: true,
            } as never),
        ).rejects.toThrow("Your role can't pay for bookings with class packs.");
    });
});

describe("setting up bookings (E26)", () => {
    it("a role saved with service:write only reads what it changes", async () => {
        const list = await bookings.listServices(as("setup-e26"));
        expect(list.map((s) => s.id)).toContain(serviceId);
    });

    it("a role without service:write is refused in words", async () => {
        await expect(
            staff.updateBookingRules(as("desk-e26"), {} as never),
        ).rejects.toThrow(
            "Your role can't change services, hours, time off or booking rules.",
        );
    });
});

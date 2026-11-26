/**
 * Which visit a booking is for its customer (DEC-274), against a real
 * Postgres: the visits they came to before this one, at this business only,
 * and when the last was; refused without `contact:read`.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "./bookings.service";

const bookings = new BookingsService();
const tag = `${process.pid}-${Date.now()}`;

let owner: OrganizationContext;
let first: string;
let fourth: string;
let nobody: string;

const day = (d: number) => new Date(Date.UTC(2026, 6, d, 9));

beforeAll(async () => {
    const userId = (
        await prisma.user.create({
            data: { email: `visits-${tag}@example.com`, name: "Neha" },
        })
    ).id;
    const [org, other] = await Promise.all(
        ["Pulse", "Elsewhere"].map((name) =>
            prisma.organization.create({
                data: { name, slug: `visits-${name}-${tag}` },
            }),
        ),
    );
    await prisma.membership.create({
        data: { organizationId: org.id, userId, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId, role: "OWNER" };
    const setUp = async (organizationId: string) => {
        const service = await prisma.service.create({
            data: {
                organizationId,
                name: "Personal training",
                durationMinutes: 60,
                capacity: 1,
                timezone: "UTC",
            },
        });
        const contact = await prisma.contact.create({
            data: {
                organizationId,
                firstName: "Gurpreet",
                email: `gurpreet-${tag}@example.com`,
            },
        });
        return { service: service.id, contact: contact.id };
    };
    const here = await setUp(org.id);
    const there = await setUp(other.id);
    const book = async (
        at: { service: string; contact: string | null },
        organizationId: string,
        d: number,
        outcome: "ATTENDED" | "NO_SHOW" | null,
        status = "CONFIRMED",
    ) =>
        (
            await prisma.booking.create({
                data: {
                    organizationId,
                    serviceId: at.service,
                    contactId: at.contact,
                    startAt: day(d),
                    endAt: new Date(day(d).getTime() + 3_600_000),
                    timezone: "UTC",
                    status,
                    outcome,
                    snapshot: {},
                },
            })
        ).id;
    first = await book(here, org.id, 1, null);
    await book(here, org.id, 2, "ATTENDED");
    await book(here, org.id, 5, "ATTENDED");
    await book(here, org.id, 8, "NO_SHOW"); // didn't come: not a visit
    await book(here, org.id, 12, "ATTENDED");
    await book(there, other.id, 13, "ATTENDED"); // another business
    fourth = await book(here, org.id, 20, null);
    await book(here, org.id, 25, "ATTENDED"); // after: not counted
    nobody = await book({ ...here, contact: null }, org.id, 21, null);
});

describe("bookingVisits (DEC-274)", () => {
    it("says a first visit when they came to none before it", async () => {
        await expect(bookings.bookingVisits(owner, first)).resolves.toEqual({
            before: 0,
            lastAt: null,
        });
    });

    it("counts only visits they came to here, before this one, and the last's date", async () => {
        await expect(bookings.bookingVisits(owner, fourth)).resolves.toEqual({
            before: 3,
            lastAt: day(12).toISOString(),
        });
    });

    it("has nothing to say for a booking with no customer", async () => {
        await expect(bookings.bookingVisits(owner, nobody)).resolves.toBeNull();
    });

    it("is refused without contact:read", async () => {
        const deskOnly: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            actions: new Set(["booking:read"]),
        };
        await expect(
            bookings.bookingVisits(deskOnly, fourth),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

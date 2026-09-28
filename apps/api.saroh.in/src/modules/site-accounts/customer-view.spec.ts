import { accountTabs } from "./account-tabs";
import {
    accountView,
    bookingView,
    noteView,
    orderView,
    packView,
    planView,
    receiptView,
} from "./customer-view";

/**
 * The account area's allow-list (round-2 plan A, A5; ADR-011): every
 * serializer is fed a row carrying what a customer must never see — a staff
 * note, Needs attention staff wording, another attendee, the booker fields
 * staff typed, payment references, internal ids — and none of it may come
 * out. A new field reaches a customer only by being named here.
 */

const SECRETS = [
    "STAFF NOTE: owes money",
    "Needs attention: anxious patient, staff wording",
    "other.attendee@example.in",
    "Other Attendee",
    "pay_ref_123",
    "org_secret_id",
    "contact_secret_id",
    "user_staff_id",
    "account+contact_secret_id@account.invalid",
];

function leaks(value: unknown): string[] {
    const text = JSON.stringify(value);
    return SECRETS.filter((secret) => text.includes(secret));
}

const noisy = {
    organizationId: "org_secret_id",
    contactId: "contact_secret_id",
    createdByUserId: "user_staff_id",
    notes: "STAFF NOTE: owes money",
    attention: [{ label: "Needs attention: anxious patient, staff wording" }],
    attendees: [{ name: "Other Attendee", email: "other.attendee@example.in" }],
    bookerEmail: "other.attendee@example.in",
    bookerName: "Other Attendee",
    providerRef: "pay_ref_123",
};

describe("the account's allow-list", () => {
    it("Me carries the account's email, never the contact's placeholder", () => {
        const view = accountView({
            account: { email: "farah@example.in", ...noisy } as never,
            contact: {
                firstName: " Farah ",
                lastName: "Khan",
                phone: " +91 98765 43210 ",
                email: "account+contact_secret_id@account.invalid",
                ...noisy,
            } as never,
            businessName: "Kavi Dental",
            tabs: accountTabs({
                appointments: true,
                orders: false,
                plans: false,
                messages: true,
                bookingsLabel: "Appointments",
            }),
            offers: { appointments: true, orders: false, plans: false },
            bookingsLabel: "Appointments",
            healthNotes: false,
        });
        expect(view).toEqual({
            name: "Farah Khan",
            email: "farah@example.in",
            phone: "+91 98765 43210",
            businessName: "Kavi Dental",
            tabs: [
                { key: "home", label: "Home" },
                { key: "me", label: "Me" },
            ],
            offers: { appointments: true, orders: false, plans: false },
            bookingsLabel: "Appointments",
            healthNotes: false,
        });
        expect(leaks(view)).toEqual([]);
    });

    it("a booking names the service, the time and who it is with — nobody else", () => {
        const view = bookingView({
            id: "bk_1",
            startAt: new Date("2026-10-05T04:30:00Z"),
            endAt: new Date("2026-10-05T05:00:00Z"),
            timezone: "Asia/Kolkata",
            locationType: "ONLINE",
            service: { name: "Check-up", ...noisy } as never,
            staff: { name: "Dr. Rao", ...noisy } as never,
            intakeNote: "STAFF NOTE: owes money",
            ...noisy,
        } as never);
        expect(view).toEqual({
            ref: "bk_1",
            service: "Check-up",
            startAt: "2026-10-05T04:30:00.000Z",
            endAt: "2026-10-05T05:00:00.000Z",
            timezone: "Asia/Kolkata",
            staff: "Dr. Rao",
            online: true,
        });
        expect(leaks(view)).toEqual([]);
    });

    it("an order says where it is in the customer's words", () => {
        const row = {
            id: "ord_1",
            orderId: "1019",
            createdAt: new Date("2026-09-20T06:00:00Z"),
            total: "450",
            currency: "INR",
            status: "PROCESSING",
            paymentStatus: "PAID",
            stage: "READY",
            items: [
                { quantity: 2, product: { name: "Sourdough", ...noisy } },
                { quantity: 1, product: { name: "Cinnamon bun" } },
                { quantity: 1, product: { name: "Rye" } },
            ],
            _count: { items: 5 },
            ...noisy,
        };
        const view = orderView(row as never);
        expect(view).toEqual({
            ref: "ord_1",
            number: "1019",
            placedAt: "2026-09-20T06:00:00.000Z",
            total: "450.00",
            currency: "INR",
            open: true,
            status: "Ready",
            items: [
                { name: "Sourdough", quantity: 2 },
                { name: "Cinnamon bun", quantity: 1 },
                { name: "Rye", quantity: 1 },
            ],
            moreItems: 2,
        });
        expect(leaks(view)).toEqual([]);
        expect(
            orderView({ ...row, paymentStatus: "REFUNDED" } as never),
        ).toMatchObject({ open: false, status: "Refunded" });
        expect(
            orderView({ ...row, status: "CANCELLED" } as never),
        ).toMatchObject({ open: false, status: "Cancelled" });
        expect(
            orderView({ ...row, stage: "DELIVERED" } as never),
        ).toMatchObject({ open: false, status: "Delivered" });
    });

    it("a plan says when it renews, pauses or ends", () => {
        const row = {
            id: "sub_1",
            status: "ACTIVE",
            price: "2500",
            currency: "INR",
            interval: "MONTH",
            currentPeriodEnd: new Date("2026-10-18T00:00:00Z"),
            cancelAtPeriodEnd: false,
            pausedUntil: null,
            plan: { name: "Unlimited", ...noisy },
            ...noisy,
        };
        const view = planView(row as never);
        expect(view).toEqual({
            ref: "sub_1",
            name: "Unlimited",
            price: "2500.00",
            currency: "INR",
            interval: "MONTH",
            status: "ACTIVE",
            renewsAt: "2026-10-18T00:00:00.000Z",
            pausedUntil: null,
            endsAt: null,
        });
        expect(leaks(view)).toEqual([]);
        expect(
            planView({
                ...row,
                status: "PAUSED",
                pausedUntil: new Date("2026-11-01T00:00:00Z"),
            } as never),
        ).toMatchObject({
            status: "PAUSED",
            renewsAt: null,
            pausedUntil: "2026-11-01T00:00:00.000Z",
        });
        expect(
            planView({ ...row, cancelAtPeriodEnd: true } as never),
        ).toMatchObject({ renewsAt: null, endsAt: "2026-10-18T00:00:00.000Z" });
    });

    it("a pack says what is left, never below zero", () => {
        const view = packView({
            credits: 10,
            used: 12,
            expiresAt: new Date("2026-12-01T00:00:00Z"),
            pack: { name: "10 classes", ...noisy } as never,
            ...noisy,
        } as never);
        expect(view).toEqual({
            name: "10 classes",
            credits: 10,
            left: 0,
            expiresAt: "2026-12-01T00:00:00.000Z",
        });
        expect(leaks(view)).toEqual([]);
    });

    it("a receipt is its number, dates and total", () => {
        const view = receiptView({
            id: "inv_1",
            number: "KD-0001",
            issuedAt: new Date("2026-09-01T00:00:00Z"),
            paidAt: new Date("2026-09-02T00:00:00Z"),
            total: "12000",
            currency: "INR",
            ...noisy,
        } as never);
        expect(view).toEqual({
            ref: "inv_1",
            number: "KD-0001",
            issuedAt: "2026-09-01T00:00:00.000Z",
            paidAt: "2026-09-02T00:00:00.000Z",
            total: "12000.00",
            currency: "INR",
        });
        expect(leaks(view)).toEqual([]);
    });

    it("a health note is the customer's own words and whether it is on record", () => {
        const view = noteView({
            id: "att_1",
            label: "Blood thinners",
            detail: "I started taking blood thinners",
            status: "SUGGESTED",
            createdAt: new Date("2026-09-28T10:00:00Z"),
            ...noisy,
        } as never);
        expect(view).toEqual({
            ref: "att_1",
            text: "I started taking blood thinners",
            sentAt: "2026-09-28T10:00:00.000Z",
            state: "SENT",
        });
        expect(leaks(view)).toEqual([]);
        expect(
            noteView({
                id: "att_1",
                label: "Blood thinners",
                detail: null,
                status: "ACTIVE",
                createdAt: new Date(),
            }),
        ).toMatchObject({ text: "Blood thinners", state: "ON_RECORD" });
    });

    it("fails when a serializer spreads a row (the check itself works)", () => {
        expect(leaks({ ...noisy })).not.toEqual([]);
    });
});

/**
 * Every write that makes a v1 webhook event emits it (plan 2026-11-10-001,
 * U13): the emit inventory, pinned.
 *
 * A source scan, as `jobs/job-consumers.spec.ts` is: the question is what
 * the code as written does. For each event it finds the writes that make
 * one (a create, or the transition) and fails a file that makes one
 * without an `emitWebhook`/`emitOrderWebhook` for that event, unless the
 * file is listed below as never emitting, with why. A new write path, or
 * one that loses its emit, fails here.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { WebhookEvent } from "@saroh/api-contract";
import { WEBHOOK_EVENTS } from "@saroh/api-contract";

const MODULES = join(__dirname, "..");

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
            ? [path]
            : [];
    });
}

const files = walk(MODULES).map((path) => ({
    rel: relative(MODULES, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
}));

/** The emit inventory: every file whose writes make each event. */
const INVENTORY: Record<WebhookEvent, string[]> = {
    // One place makes a booking, whoever books: the workspace, a site, a
    // storefront key, a course's sessions, a visit.
    "booking.created": ["bookings/reservation.ts"],
    // A new time; a new person at the same time is not a move.
    "booking.moved": ["bookings/booking-move.ts"],
    "order.created": [
        "bookings/visits.ts",
        "orders/checkout-order.ts",
        "orders/orders.service.ts",
    ],
    // Beside each `recordOrderPaidInTx`: the places PAID is reached
    // (online and payment lookups through `moveOrderPayment`).
    "order.paid": [
        "bookings/booking-hold.ts",
        "orders/new-order.ts",
        "orders/orders.service.ts",
        "webhooks/webhooks.service.ts",
    ],
    "order.status_changed": [
        "bookings/treatment-unsold.ts",
        "orders/new-order.ts",
        "orders/online-checkout.ts",
        "orders/order-cancel.ts",
        "orders/order-stage-write.ts",
        "orders/orders.service.ts",
        "orders/treatment-fulfil.ts",
    ],
    // A customer is a Contact, as `/v1/customers` reads them.
    "customer.created": [
        "bookings/phone-booker.ts",
        "bookings/reservation.ts",
        "contacts/contacts.service.ts",
        "customer-workspace/customer-add.service.ts",
        "customer-workspace/ensure-contact.ts",
        "enquiry/enquiry.service.ts",
        "leads/leads.service.ts",
        "orders/walk-in-customer.ts",
        "public-api/storefront.service.ts",
        "site-accounts/account-linking.service.ts",
        "site-accounts/account-unlink.service.ts",
    ],
    "enquiry.received": [
        "enquiry/enquiry.service.ts",
        "leads/leads.service.ts",
    ],
};

/** Files that make an event's record and never emit, with why. */
const NEVER_EMITS: Record<string, string> = {
    "imports/imports.service.ts":
        "An import brings in records the business already has: never an event.",
};

/** What makes each event, as source. */
const MAKES: Record<WebhookEvent, RegExp> = {
    "booking.created": /\bbooking\.(create|createMany)\(/,
    "booking.moved": /\bbooking\.update\(\{[^}]*\}\s*,?\s*data:[^;]*startAt/s,
    "order.created": /\border\.(create|createMany)\(/,
    "order.paid": /await recordOrderPaidInTx\(/,
    "order.status_changed":
        /\border\.(update|updateMany)\([^;]{0,300}data:\s*\{[^}]*\bstatus:/s,
    "customer.created":
        /[cC]ontact\.(create|createMany|upsert)\(|linkPayingCustomer\(/,
    "enquiry.received": /\blead\.(create|createMany)\(/,
};

const emits = (text: string, event: WebhookEvent) =>
    new RegExp(
        `emit(Order)?Webhook\\([\\s\\S]{0,200}?"${event.replace(".", "\\.")}"`,
    ).test(text);

describe("outbound webhooks: the emit inventory", () => {
    it("lists all 7 v1 events", () => {
        expect(Object.keys(INVENTORY).sort()).toEqual(
            [...WEBHOOK_EVENTS].sort(),
        );
    });

    it.each(WEBHOOK_EVENTS.map((e) => [e]))(
        "%s: every inventoried file makes one and emits it",
        (event) => {
            for (const rel of INVENTORY[event]) {
                const file = files.find((f) => f.rel === rel);
                expect({
                    rel,
                    makes: MAKES[event].test(file?.text ?? ""),
                }).toEqual({ rel, makes: true });
                expect({ rel, emits: emits(file?.text ?? "", event) }).toEqual({
                    rel,
                    emits: true,
                });
            }
        },
    );

    it.each(WEBHOOK_EVENTS.map((e) => [e]))(
        "%s: every file that makes one is inventoried",
        (event) => {
            const makers = files
                .filter((f) => !f.rel.startsWith("outbound-webhooks/"))
                .filter((f) => !(f.rel in NEVER_EMITS))
                .filter((f) => MAKES[event].test(f.text))
                .map((f) => f.rel);
            const missing = makers.filter(
                (rel) => !INVENTORY[event].includes(rel),
            );
            expect(missing).toEqual([]);
        },
    );

    it("imports never emit", () => {
        const imports = files.filter((f) => f.rel.startsWith("imports/"));
        expect(imports.length).toBeGreaterThan(0);
        for (const f of imports) {
            expect(/emit(Order)?Webhook\(/.test(f.text)).toBe(false);
        }
    });
});

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A confirm whose own button cancels something never offers "Cancel" as the
 * way out: two buttons saying "cancel" for opposite things is how the wrong
 * one gets pressed. The way out says what it keeps, and the same action
 * says the same thing wherever it is asked from.
 */
const APP = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(APP, file), "utf8");

/** Each confirm: its file, the button that cancels, and the way out. */
const CONFIRMS: [what: string, file: string, verb: string, keep: string][] = [
    [
        "an order, from its page",
        "components/commerce/order-detail/cancel-panel.tsx",
        'tone="destructive"',
        'cancelLabel="Keep order"',
    ],
    [
        "an order, from the older menu",
        "components/commerce/order-actions.tsx",
        'verb: "Cancel order"',
        'keep: "Keep order"',
    ],
    [
        "a booking",
        // The one cancel sheet every screen opens (U3).
        "components/bookings/sheets/cancel-sheet.tsx",
        '"Cancel booking"',
        "Keep booking",
    ],
    [
        "an enrolment",
        "components/courses/course-page.tsx",
        "Cancel enrolment",
        "Keep enrolment",
    ],
    [
        "a subscription",
        "components/subscriptions/subscription-detail/action-dialogs.tsx",
        '"Cancel subscription"',
        "Keep subscription",
    ],
    [
        "autopay",
        "components/subscriptions/subscription-detail/autopay-panel.tsx",
        '"Cancel autopay"',
        "Keep autopay",
    ],
    [
        "a Saroh plan (17 Oct 2026)",
        "components/settings/plan-billing/cancel-plan.tsx",
        '"Cancel plan"',
        "`Keep ${offer.planName}`",
    ],
    [
        "an invoice (Cancel or correct, DEC-173 U13)",
        "components/invoices/cancel-or-correct/cancel-or-correct-sheet.tsx",
        'tone="destructive"',
        'cancelLabel="Keep invoice"',
    ],
    [
        "a paid invoice, by Refund…",
        "components/invoices/details/invoice-actions.tsx",
        "Issue the credit note",
        'cancelLabel="Keep invoice"',
    ],
];

describe("the way out of a confirm that cancels", () => {
    it.each(CONFIRMS)("cancelling %s", (_what, file, verb, keep) => {
        const src = read(file);
        expect(src).toContain(verb);
        expect(src).toContain(keep);
    });

    it("the ways to cancel an order that ask say the same thing", () => {
        // From the Orders list a cancel asks nothing: it is held ten
        // seconds with Undo.
        for (const file of [
            "components/commerce/order-detail/cancel-panel.tsx",
            "components/commerce/order-actions.tsx",
        ]) {
            const src = read(file);
            expect(src, file).toContain("Keep order");
            expect(src, file).not.toMatch(
                /"Keep it"|"Not yet",?\s*\n\s*onConfirm/,
            );
        }
    });

    it("no ConfirmDialog pairs a Cancel verb with the default Cancel", () => {
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                const at = path.join(dir, e.name);
                if (e.isDirectory()) walk(at);
                else if (e.name.endsWith(".tsx") && !e.name.includes(".test."))
                    files.push(at);
            }
        };
        walk(path.join(APP, "components"));
        const wrong: string[] = [];
        for (const file of files) {
            const src = readFileSync(file, "utf8");
            for (const m of Array.from(
                src.matchAll(/<ConfirmDialog\b[\s\S]*?\/>/g),
            )) {
                const block = m[0];
                if (!/confirmLabel="Cancel\b/.test(block)) continue;
                const keep = /keepLabel="([^"]+)"/.exec(block)?.[1];
                if (!keep?.startsWith("Keep ")) {
                    wrong.push(
                        `${path.relative(APP, file)}: ${keep ?? "Cancel"}`,
                    );
                }
            }
        }
        expect(wrong).toEqual([]);
    });
});

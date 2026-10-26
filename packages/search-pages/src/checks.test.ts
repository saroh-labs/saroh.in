import { describe, expect, it } from "vitest";

import { searchPageChecks } from "./checks";
import { allSearchPages, loadSearchPage } from "./load";
import type { SearchPageData } from "./schema";

const failing = (p: SearchPageData) => searchPageChecks(p).filter((c) => !c.ok);

/** The list's i-th entry, which the test knows is there. */
function at<T>(list: T[] | undefined, i: number): T {
    const v = list?.[i];
    if (v === undefined) throw new Error(`no entry ${i}`);
    return v;
}

describe("searchPageChecks", () => {
    it.each(allSearchPages().map((p) => [p.slug, p] as const))(
        "%s passes every check",
        (_, p) => {
            expect(failing(p)).toEqual([]);
        },
    );

    // gen.py's selftest: every data check must fire on a broken page.
    const salons = loadSearchPage("salons");
    if (!salons) throw new Error("salons is missing");
    const breaks: [string, string, (p: SearchPageData) => void][] = [
        ["beauty word on health", "family-words", (p) => (p.family = "Health")],
        [
            "class in an appointment drawing",
            "shape-words",
            (p) => (at(p.scene.today, 0).name = "Morning class"),
        ],
        ["bill math", "bill-math", (p) => (p.scene.bill.cgst = 91.63)],
        [
            "₹ range",
            "prices-range",
            (p) =>
                (p.scene.customer.stats = [
                    at(p.scene.customer.stats, 0),
                    "₹3,18,400 spent",
                ]),
        ],
        ["placeholder", "placeholders", (p) => (p.lead += " [more]")],
        [
            "order online",
            "claims",
            (p) => (p.lead += " Customers order online."),
        ],
        [
            "reminder sent",
            "claims",
            (p) => (p.scene.customer.note = "Reminder sent on Friday."),
        ],
        [
            "autopay alone",
            "claims",
            (p) => (at(p.scene.also, 2).line = "Fees renew by UPI Autopay."),
        ],
        ["own domain", "site-address", (p) => (p.scene.site = "glowstudio.in")],
        [
            "no SAC/HSN",
            "bill-codes",
            (p) => (at(p.scene.bill.lines, 0).code = ""),
        ],
        ["long phone lead", "phone-lead", (p) => (p.phoneLead = p.lead)],
        [
            "quote not the trade's",
            "quote",
            (p) => (p.scene.quote.text = "Something nobody said."),
        ],
        [
            "a real email",
            "sample-emails",
            (p) => (p.scene.customer.note = "Mail riya@gmail.com the bill."),
        ],
        [
            "a real GST number",
            "sample-gstin",
            (p) => (p.scene.customer.note = "Office GST 27ABCDE1234F1Z5."),
        ],
        [
            "private, not sensitive",
            "sensitive-label",
            (p) => (at(p.scene.also, 3).line = "Mark a note private."),
        ],
        [
            "staff not on the team",
            "scene",
            (p) => p.scene.booking && (p.scene.booking.staff = "Ravi"),
        ],
        [
            "a deposit nobody paid",
            "scene",
            (p) => p.scene.booking && delete p.scene.booking.depositBy,
        ],
        ["long title", "seo-title", (p) => (p.title = "x".repeat(60))],
    ];
    it.each(breaks)("fires on %s", (_, id, brk) => {
        const p = structuredClone(salons);
        brk(p);
        expect(failing(p).map((c) => c.id)).toContain(id);
    });

    it("says what each check is, with a severity", () => {
        for (const c of searchPageChecks(salons)) {
            expect(c.title).toBeTruthy();
            expect(["error", "warning"]).toContain(c.severity);
        }
    });
});

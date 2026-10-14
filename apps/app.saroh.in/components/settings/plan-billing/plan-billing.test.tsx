import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PickerRow, PlanNote } from "@/lib/saroh-billing/plan-view";

import { CheckoutPending } from "./checkout-pending";
import { HowBillingWorks } from "./how-billing-works";
import { PlanChooser } from "./plan-chooser";
import { YourPlan } from "./your-plan";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settings/billing",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/saroh-billing/billing-actions", () => ({
    checkCouponAction: vi.fn(),
    confirmCheckoutAction: vi.fn(),
    changePlanAction: vi.fn(),
    quoteChangeAction: vi.fn(),
}));

/**
 * Settings › Plan and billing's parts, drawn on the server (UX-003,
 * UX-044, UX-045; the cards, the one status line and the one message of 13
 * Oct 2026). Made-up plans and prices.
 */

const END = "2027-12-31T00:00:00.000Z";

const row = (over: Partial<PickerRow> & { planId: string }): PickerRow => ({
    name: `Plan ${over.planId.toUpperCase()}`,
    price: "₹111 a month + GST",
    amount: "₹111",
    per: "a month + GST",
    what: `For ${over.planId.toUpperCase()}.`,
    offer: null,
    current: false,
    cta: null,
    scheduled: null,
    lead: "",
    lines: [],
    note: null,
    ...over,
});

const FREE = { price: "₹0", amount: "₹0", per: "" };

const rows: PickerRow[] = [
    row({
        planId: "a",
        ...FREE,
        lines: ["10 things"],
        note: { lead: "After ", iso: END },
    }),
    row({
        planId: "b",
        current: true,
        cta: { label: "Keep Plan B", iso: null, primary: false },
        lead: "Everything in Plan A, plus:",
        lines: ["Take payments online", "A team of 3"],
        note: { lead: "You're on this until ", iso: END },
    }),
];

const chooser = (
    shown: PickerRow[],
    over: Partial<Parameters<typeof PlanChooser>[0]> = {},
) =>
    renderToStaticMarkup(
        <PlanChooser
            rows={{ month: shown, year: shown }}
            yearly={{ on: false }}
            initialCycle="month"
            canChange
            currentPlan="Plan B"
            {...over}
        />,
    );

/** Each plan's card, as its own HTML. */
const cards = (html: string) => html.split("<li data-plan=").slice(1);

/** The words in some markup: its tags taken out until none is left. */
function untagged(html: string): string {
    let out = html;
    for (let before = ""; before !== out;) {
        before = out;
        out = out.replace(/<[^>]+>/g, "");
    }
    return out;
}

/** What each plan's button reads as, tags aside (the coupon's is not one). */
const buttons = (html: string) =>
    (
        html
            .split('aria-label="Coupon"')[0]
            .match(/<button[^>]*>.*?<\/button>/g) ?? []
    ).map(untagged);

describe("PlanChooser", () => {
    it("draws each plan as a card: its name, its price largest, who it's for and every line", () => {
        const many = [
            rows[0],
            row({
                planId: "c",
                offer: "First month ₹7 + GST",
                cta: {
                    label: "Start with the first month",
                    iso: null,
                    primary: true,
                },
                lead: "Everything in Plan B, plus:",
                lines: ["One", "Two", "Three", "Four", "Five", "Six"],
            }),
        ];
        const html = chooser(many);
        const [, c] = cards(html);
        expect(c).toContain("<h3");
        expect(c).toContain("Plan C</h3>");
        // The amount in the card's largest type, what it is for beside it.
        expect(c).toMatch(/text-\[32px\][^>]*>₹111</);
        expect(c).toContain("a month + GST");
        expect(c).toContain("For C.");
        expect(c).toContain("First month ₹7 + GST");
        expect(c).toContain("Everything in Plan B, plus:");
        for (const line of ["One", "Two", "Three", "Four", "Five", "Six"]) {
            expect(c).toContain(`${line}</li>`);
        }
        // No offer line on a plan that has none for this business.
        expect(cards(html)[0]).not.toContain("First month");
        // A way to the whole comparison, on Saroh's own site.
        expect(html).toMatch(
            /href="https:\/\/[^"]+\/pricing"[^>]*>Compare everything on the pricing page/,
        );
    });

    it("says where the business stands under a plan given for a while", () => {
        const html = chooser(rows);
        expect(html).toContain("You&#x27;re on this until");
        expect(html).toContain("After ");
        // The plan held for a while offers to keep it, not a trial.
        expect(buttons(html)).toContain("Keep Plan B");
        expect(html).not.toContain("trial");
    });

    it("names each button for what it does: a move up filled, a move down quiet and dated (DEC-159)", () => {
        const timed: PickerRow[] = [
            row({
                planId: "a",
                ...FREE,
                cta: {
                    label: "Move to Plan A from ",
                    iso: END,
                    primary: false,
                },
                note: {
                    lead: "From ",
                    iso: END,
                    tail: ": you keep Plan B until then.",
                    brief: "You keep Plan B until then.",
                },
            }),
            row({ planId: "b", current: true }),
            row({
                planId: "c",
                cta: { label: "Upgrade to Plan C", iso: null, primary: true },
                note: {
                    lead: "Starts today: ₹65.49 now (incl. GST)",
                    iso: null,
                },
            }),
        ];
        const html = chooser(timed);
        const [a, b, c] = cards(html);

        // Moving down: the quiet button, with the date in its words.
        expect(a).toMatch(
            /<button[^>]*border-border bg-card[^>]*>.*Move to Plan A from <time[^>]*>[^<]*2027<\/time>/,
        );
        // The button has said the date, so the line under it doesn't again.
        expect(a).toContain("You keep Plan B until then.");
        expect(a).not.toContain("From <time");

        // Moving up: the filled button, and what is paid now under it.
        expect(c).toMatch(
            /<button[^>]*bg-primary text-primary-foreground[^>]*>.*Upgrade to Plan C/,
        );
        expect(c).toContain("Starts today: ₹65.49 now (incl. GST)");

        // The plan it's on: marked, edged, and its button is off.
        expect(b).toContain('aria-current="true"');
        expect(b).toContain("border-foreground");
        expect(b).toMatch(/<span[^>]*rounded-full[^>]*>Current plan<\/span>/);
        expect(b).toMatch(/<button[^>]*disabled=""[^>]*>/);
        expect(a).not.toContain("Current plan");

        expect(buttons(html)).toEqual([
            "Move to Plan A from 31 Dec 2027",
            // Named for a screen reader where the words don't name it.
            "Current plan: Plan B",
            "Upgrade to Plan C",
        ]);
    });

    it("names the plan in a button whose words don't", () => {
        const html = chooser([
            row({
                planId: "c",
                cta: {
                    label: "Start with the first month",
                    iso: null,
                    primary: true,
                },
            }),
        ]);
        expect(html).toContain(
            'Start with the first month<span class="sr-only">: Plan C</span>',
        );
    });

    it("shows a plan that already waits as its date, with no button to make the change twice", () => {
        const waiting: PickerRow[] = [
            row({
                planId: "a",
                ...FREE,
                scheduled: END,
                note: {
                    lead: "From ",
                    iso: END,
                    tail: ": you keep Plan B until then.",
                    brief: "You keep Plan B until then.",
                },
            }),
            row({ planId: "b", current: true }),
        ];
        const [a] = cards(chooser(waiting));
        expect(a).toMatch(/Your plan from <time[^>]*>[^<]*2027<\/time>/);
        expect(a).toContain("You keep Plan B until then.");
        expect(a).not.toContain("<button");
        // Read without billing:manage, the state is still said.
        const [readOnly] = cards(chooser(waiting, { canChange: false }));
        expect(readOnly).toMatch(/Your plan from <time/);
    });

    it("offers Monthly or Yearly only when the catalogue has yearly billing", () => {
        expect(chooser(rows)).not.toMatch(/yearly/i);
        expect(
            chooser(rows, { yearly: { on: true, freeMonths: 2 } }),
        ).toContain("Yearly · 2 months free");
    });

    it("says the plans couldn't be read, never an empty picker", () => {
        const html = renderToStaticMarkup(
            <PlanChooser
                rows={null}
                yearly={{ on: false }}
                initialCycle="month"
                canChange
                currentPlan="Plan B"
            />,
        );
        expect(html).toContain("Couldn&#x27;t load Saroh&#x27;s plans");
        expect(html).not.toContain("<li data-plan=");
    });
});

const note = (over: Partial<PlanNote> & Pick<PlanNote, "kind">): PlanNote => ({
    tone: "info",
    lead: "",
    iso: null,
    tail: "",
    action: null,
    ...over,
});

const FIRST_MONTH = note({
    kind: "firstMonth",
    lead: "Your first month runs to ",
    iso: END,
    tail: ", when the first full charge is taken. If it doesn't go through, you're back on Free.",
});
const TERM = note({
    kind: "term",
    lead: "Your 12 monthly charges run to ",
    iso: END,
    tail: ". In its last 30 days we ask you to pay for the next term, and paying starts it.",
});
const MOVE = note({
    kind: "move",
    lead: "Your plan changes to Plan A on ",
    iso: END,
    tail: ". Everything stays until then.",
});
const OVERDUE = note({
    kind: "overdue",
    tone: "attention",
    lead: "The last payment didn't go through. Nothing has been switched off yet.",
});

const yourPlan = (over: Partial<Parameters<typeof YourPlan>[0]> = {}) =>
    renderToStaticMarkup(
        <YourPlan
            name="Plan B"
            price="₹111 a month + GST"
            includes=""
            next={{ kind: "text", text: "Nothing to pay" }}
            method={null}
            footnote=""
            {...over}
        />,
    );

/** The words on the page, tags aside. */
const words = (html: string) => untagged(html).replace(/&#x27;/g, "'");

const notices = (html: string) => html.match(/data-notice="/g) ?? [];

describe("Your plan: one status line", () => {
    it("says the plan and the first month, then what follows", () => {
        const html = yourPlan({
            status: [
                { lead: "First month until ", iso: END },
                { lead: "then ₹111 + GST a month" },
            ],
            notes: [FIRST_MONTH, TERM],
        });
        expect(words(html)).toContain(
            "You're on Plan B\u00a0· First month until 31 Dec 2027\u00a0· then ₹111 + GST a month",
        );
        // Background facts are not messages: nothing is stacked under it.
        expect(notices(html)).toHaveLength(0);
        expect(html).not.toContain("Your first month runs to");
        expect(html).not.toContain("Your 12 monthly charges");
    });

    it("says the next charge, or that there is nothing to pay", () => {
        expect(
            words(
                yourPlan({
                    next: { kind: "charge", iso: END, amount: "₹111 + GST" },
                }),
            ),
        ).toContain(
            "You're on Plan B\u00a0· Next charge ₹111 + GST on 31 Dec 2027",
        );
        expect(words(yourPlan({ name: "Plan A", price: "₹0" }))).toContain(
            "You're on Plan A\u00a0· Nothing to pay",
        );
    });
});

describe("Your plan: at most one message", () => {
    it("shows a plan change that is on its way, and when", () => {
        const html = yourPlan({ notes: [FIRST_MONTH, MOVE, TERM] });
        expect(notices(html)).toHaveLength(1);
        expect(words(html)).toContain(
            "Your plan changes to Plan A on 31 Dec 2027. Everything stays until then.",
        );
    });

    it("shows a failed payment before a plan change, never both", () => {
        const html = yourPlan({ notes: [MOVE, OVERDUE, TERM] });
        expect(notices(html)).toEqual(['data-notice="']);
        expect(html).toContain('data-notice="warning"');
        expect(words(html)).toContain("The last payment didn't go through.");
        expect(html).not.toContain("Your plan changes to");
    });

    it("shows a payment under way before any note, and nothing beside it", () => {
        const html = yourPlan({
            notes: [OVERDUE, MOVE],
            pending: { planName: "Plan C", expiresAt: END, handoff: null },
        });
        expect(notices(html)).toHaveLength(1);
        expect(html).toContain("Checking your payment for Plan C");
        expect(html).not.toContain("didn&#x27;t go through");
    });
});

describe("How billing works", () => {
    it("is closed, and keeps what the page no longer stacks as notes", () => {
        const html = renderToStaticMarkup(
            <HowBillingWorks
                notes={[FIRST_MONTH, TERM]}
                yearly={false}
                canChange
            />,
        );
        expect(html).toMatch(/^<details(?![^>]*\sopen)[^>]*>/);
        expect(html).toContain("How billing works</summary>");
        const said = words(html);
        expect(said).toContain(
            "Your first month runs to 31 Dec 2027, when the first full charge is taken. If it doesn't go through, you're back on Free.",
        );
        expect(said).toContain(
            "Your 12 monthly charges run to 31 Dec 2027. In its last 30 days we ask you to pay for the next term, and paying starts it.",
        );
        expect(said).toContain(
            "Plans are paid monthly by autopay, for 12 months. Before that ends, we ask you to pay for the next term.",
        );
        expect(said).toContain(
            "Upgrades start today. A cheaper plan or Free starts when what you've paid for ends.",
        );
        expect(said).not.toMatch(/yearly/i);
    });

    it("keeps a displaced note's way on, for whoever may change the plan", () => {
        const renew = note({
            kind: "renew",
            tone: "attention",
            lead: "Your 12 months of Plan B end on ",
            iso: END,
            tail: ".",
            action: { label: "Renew", planId: "b", cycle: "month" },
        });
        const draw = (canChange: boolean) =>
            renderToStaticMarkup(
                <HowBillingWorks
                    notes={[renew]}
                    yearly
                    canChange={canChange}
                />,
            );
        expect(draw(true)).toMatch(
            /href="\/settings\/billing\/plans\?plan=b&amp;cycle=month"[^>]*>Renew/,
        );
        expect(draw(false)).not.toContain("Renew");
        expect(draw(true)).toContain("yearly is one payment");
    });
});

describe("CheckoutPending", () => {
    it("checks with Razorpay on arrival and never offers to start again", () => {
        const html = renderToStaticMarkup(
            <CheckoutPending
                pending={{
                    planName: "Plan B",
                    expiresAt: "2026-10-08T00:00:00.000Z",
                    handoff: null,
                }}
            />,
        );
        expect(html).toContain("Checking your payment for Plan B with");
        expect(html).not.toMatch(/start again/i);
    });
});

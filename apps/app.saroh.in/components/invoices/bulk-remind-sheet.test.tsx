// @vitest-environment jsdom
/**
 * Remind many, by channel (DEC-173, U12 #1124, INVBulkSend): the three
 * steps.
 *
 * - Step 1 ticks every one shown and says what the ticked ones owe.
 * - Step 2 groups them as email, WhatsApp and can't reach, with why, and
 *   the button says what happens: "Send 1 email, then WhatsApp 1".
 * - Step 3 holds the emails ten seconds with Undo in the sheet, walks the
 *   WhatsApp ones one at a time (Open or Skip), and ends with the tally.
 * - Undo in the hold sends nothing and comes back to step 2.
 * - With no email of the business's own there is no email group.
 * - More than 100 go in calls of at most 100.
 */
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    ReminderPreview,
    ReminderRow,
    ReminderSendResult,
} from "@/lib/invoices/remind-all";
import type { PickRow, RemindedBy } from "@/lib/invoices/remind-many";
import type { Invoice } from "@/lib/invoices/service";

import { BulkRemindSheet } from "./bulk-remind-sheet";

const calls = vi.hoisted(() => ({
    previewReminders: vi.fn(),
    sendReminders: vi.fn(),
    openWhatsAppShare: vi.fn(),
    forgetLink: vi.fn(),
    toast: {
        showUndo: vi.fn(() => 1),
        showSuccess: vi.fn(),
        showError: vi.fn(),
        showWarning: vi.fn(),
        showInfo: vi.fn(),
        dismissToast: vi.fn(),
    },
}));

vi.mock("@/lib/api/http", () => ({}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/billing/invoices",
    unstable_rethrow: () => undefined,
}));
vi.mock("@saroh/ui/toast", () => ({
    ...calls.toast,
    settleUndo: (run: () => unknown) => run(),
}));
vi.mock("@/lib/invoices/actions", () => ({
    previewReminders: calls.previewReminders,
    sendReminders: calls.sendReminders,
}));
vi.mock("@/components/invoices/whatsapp-share", () => ({
    openWhatsAppShare: calls.openWhatsAppShare,
}));
vi.mock("@/lib/invoices/minted-links", () => ({
    forgetLink: calls.forgetLink,
}));
// The share sheet's own module is drawn only for its preview bubble.
vi.mock("@/components/invoices/share-sheet", () => ({
    MessagePreview: ({ text }: { text: string }) => (
        <blockquote data-preview="">{text}</blockquote>
    ),
}));

let root: Root;
let host: HTMLDivElement;
const reminded: [string, RemindedBy][] = [];

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    reminded.length = 0;
    for (const fn of [
        calls.previewReminders,
        calls.sendReminders,
        calls.openWhatsAppShare,
        calls.forgetLink,
        ...Object.values(calls.toast),
    ])
        fn.mockReset();
    calls.toast.showUndo.mockReturnValue(1);
    window.open = vi.fn(() => null);
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
});

async function settle() {
    await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
    });
}

async function holdEnds() {
    act(() => {
        vi.advanceTimersByTime(10_000);
    });
    await settle();
}

const DAY = 86_400_000;
const NOW = Date.now();

function invoice(id: string, name: string, total: string): Invoice {
    return {
        id,
        number: `RC/26-27/${id}`,
        status: "ISSUED",
        standing: "OVERDUE",
        kind: "INVOICE",
        related: null,
        corrections: [],
        order: null,
        contact: { id: `c_${id}`, name, email: "" },
        billTo: { name, email: null },
        currency: "INR",
        subtotal: total,
        tax: "0.00",
        total,
        leftToPay: total,
        paidSoFar: "0.00",
        partlyPaid: false,
        chequeWaiting: false,
        issuedAt: new Date(NOW - 30 * DAY).toISOString(),
        dueAt: new Date(NOW - 13 * DAY).toISOString(),
        paidAt: null,
        voidedAt: null,
        voidReason: null,
        payment: null,
        source: "MANUAL",
        subscriptionId: null,
        periodStart: null,
        periodEnd: null,
        courseEnrollmentId: null,
        packPurchaseId: null,
        reissuedFromId: null,
        reissuedAsId: null,
        issuedAutomatically: false,
        createdAt: new Date(NOW - 30 * DAY).toISOString(),
        updatedAt: new Date(NOW - 30 * DAY).toISOString(),
        summary: null,
    };
}

const pick = (
    id: string,
    name: string,
    amountMinor: number,
    lateDays: number,
): PickRow => ({
    invoiceId: id,
    name,
    number: `RC/26-27/${id}`,
    amountMinor,
    currency: "INR",
    lateDays,
});

const ROWS = [
    pick("0106", "Vivek Nair", 840000, 13),
    pick("0135", "Nikhil Rao", 180000, 4),
    pick("0136", "Tara Pillai", 48000, 3),
];
const INVOICES = [invoice("0106", "Vivek Nair", "8400.00")];

const reply = (
    over: Partial<ReminderRow> & { invoiceId: string },
): ReminderRow => ({
    way: "EMAIL",
    reason: null,
    number: `RC/26-27/${over.invoiceId}`,
    currency: "INR",
    ...over,
});

/** One with email, one with a phone only, one reminded today. */
const MIXED: ReminderPreview = {
    message: null,
    invoices: [
        reply({
            invoiceId: "0106",
            way: "WHATSAPP",
            reason: "NO_EMAIL_ADDRESS",
            name: "Vivek Nair",
            phone: "+919845011234",
            leftToPay: "8400.00",
        }),
        reply({
            invoiceId: "0135",
            name: "Nikhil Rao",
            email: "nikhil@example.com",
            leftToPay: "1800.00",
        }),
        reply({
            invoiceId: "0136",
            way: "WAIT",
            reason: "REMINDED_TODAY",
            name: "Tara Pillai",
            retryAt: new Date(NOW + DAY).toISOString(),
            leftToPay: "480.00",
        }),
    ],
};

const EMAILED = (ids: string[]): ReminderSendResult => ({
    invoices: ids.map((id) => ({
        ...reply({ invoiceId: id, name: `Person ${id}` }),
        outcome: "EMAILED" as const,
    })),
});

function Harness({
    rows,
    invoices = INVOICES,
}: {
    rows: PickRow[];
    invoices?: Invoice[];
}) {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button type="button" data-reopen="" onClick={() => setOpen(true)}>
                reopen
            </button>
            <BulkRemindSheet
                open={open}
                onOpenChange={setOpen}
                rows={rows}
                invoices={invoices}
                businessName="Rye & Co."
                timeZone="Asia/Kolkata"
                onReminded={(id, by) => reminded.push([id, by])}
            />
        </>
    );
}

function draw(rows: PickRow[] = ROWS) {
    act(() => root.render(<Harness rows={rows} />));
}

const page = () => document.body;
const sheet = () =>
    page().querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
const text = () => sheet()?.textContent ?? "";
const step = () =>
    page().querySelector<HTMLElement>("[data-remind-step]")?.dataset.remindStep;
const button = (name: string) => {
    const found = Array.from(page().querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!found) throw new Error(`no button ${name}`);
    return found;
};
const hasButton = (name: string) =>
    Array.from(page().querySelectorAll("button")).some(
        (b) => b.textContent.trim() === name,
    );
const group = (way: string) =>
    Array.from(page().querySelectorAll(`[data-remind-row="${way}"]`)).map(
        (r) => r.querySelector("b")?.textContent,
    );

async function toStep2(preview: ReminderPreview = MIXED) {
    calls.previewReminders.mockResolvedValue({ ok: true, data: preview });
    act(() => button("Next: how each one goes").click());
    await settle();
}

describe("step 1: pick who", () => {
    it("ticks every one shown and says what the ticked ones owe", () => {
        draw();
        expect(text()).toContain("Remind about overdue invoices");
        expect(text()).toContain("Step 1 of 3 · Pick who");
        const boxes = page().querySelectorAll(
            '[data-remind-pick] button[role="checkbox"]',
        );
        expect(boxes).toHaveLength(3);
        expect(
            Array.from(boxes).every(
                (b) => b.getAttribute("aria-checked") === "true",
            ),
        ).toBe(true);
        expect(text()).toContain("3 overdue shown. Ticked: 3 · ₹10,680.");
        expect(text()).toContain("13 days late");

        act(() => (boxes[2] as HTMLButtonElement).click());
        expect(text()).toContain("3 overdue shown. Ticked: 2 · ₹10,200.");
        expect(calls.previewReminders).not.toHaveBeenCalled();
    });

    it("with nothing ticked, Next is off", () => {
        draw([ROWS[0]]);
        const box = page().querySelector<HTMLButtonElement>(
            '[data-remind-pick] button[role="checkbox"]',
        );
        act(() => box?.click());
        expect(button("Next: how each one goes").disabled).toBe(true);
    });
});

describe("step 2: how each one goes", () => {
    it("groups mixed channels 1, 1 and 1, with why, and says what the button does", async () => {
        draw();
        await toStep2();
        expect(calls.previewReminders).toHaveBeenCalledWith({
            invoiceIds: ["0106", "0135", "0136"],
        });
        expect(step()).toBe("ways");
        expect(text()).toContain("3 invoices · ₹10,680");
        expect(text()).toContain(
            "1 goes by email now. WhatsApp opens for Vivek after, one tap each. Tara can't be reached now.",
        );
        expect(group("email")).toEqual(["Nikhil Rao"]);
        expect(group("whatsapp")).toEqual(["Vivek Nair"]);
        expect(group("none")).toEqual(["Tara Pillai"]);
        expect(text()).toContain("nikhil@example.com");
        expect(text()).toContain("No email");
        // One reminder a day: Tara waits, and says until when.
        expect(text()).toContain(
            "Reminded today. Next one tomorrow (one a day).",
        );
        expect(text()).toContain(
            "Email goes from your own provider. Saroh never emails your customers from its address.",
        );
        expect(hasButton("Send 1 email, then WhatsApp 1")).toBe(true);
        expect(calls.sendReminders).not.toHaveBeenCalled();
    });

    it("names who can't be reached at all, and with no one to reach nothing can be sent", async () => {
        draw([ROWS[0]]);
        await toStep2({
            message: null,
            invoices: [
                reply({
                    invoiceId: "0106",
                    way: "NONE",
                    reason: "UNREACHABLE",
                    name: "Vivek Nair",
                }),
            ],
        });
        expect(group("none")).toEqual(["Vivek Nair"]);
        expect(text()).toContain("No email or phone");
        expect(button("Nothing to send").disabled).toBe(true);
    });

    it("with no email of the business's own there is no email group, and the button is WhatsApp alone", async () => {
        draw(ROWS.slice(0, 2));
        await toStep2({
            message: null,
            invoices: ["0106", "0135"].map((id) =>
                reply({
                    invoiceId: id,
                    way: "WHATSAPP",
                    reason: "NO_EMAIL_PROVIDER",
                    name: `Person ${id}`,
                    phone: "+919845011234",
                }),
            ),
        });
        expect(group("email")).toEqual([]);
        expect(hasButton("WhatsApp 2")).toBe(true);
        const connect = page().querySelector<HTMLAnchorElement>(
            "[data-no-provider] a",
        );
        expect(connect?.textContent).toBe("Connect email");
        expect(connect?.getAttribute("href")).toBe("/settings/providers");
    });

    it("a failed read says nothing was sent, and Back returns to who", async () => {
        draw();
        calls.previewReminders.mockResolvedValue({ ok: false, error: "x" });
        act(() => button("Next: how each one goes").click());
        await settle();
        expect(text()).toContain("No reminder was sent.");
        act(() => button("Back").click());
        expect(step()).toBe("pick");
    });
});

describe("step 2's read: only the newest pick lands (review #12)", () => {
    function later() {
        let answer: (v: unknown) => void = () => undefined;
        const promise = new Promise((resolve) => {
            answer = resolve;
        });
        return { promise, answer: (v: unknown) => answer(v) };
    }

    const forIds = (ids: string[]): ReminderPreview => ({
        message: null,
        invoices: ids.map((id) =>
            reply({
                invoiceId: id,
                name: `Person ${id}`,
                email: `${id}@example.com`,
            }),
        ),
    });

    it("Next, Back, untick, Next: the older preview landing last is dropped", async () => {
        draw();
        const first = later();
        calls.previewReminders.mockReturnValueOnce(first.promise);
        act(() => button("Next: how each one goes").click());
        await settle();
        act(() => button("Back").click());
        const boxes = page().querySelectorAll<HTMLButtonElement>(
            '[data-remind-pick] button[role="checkbox"]',
        );
        act(() => boxes[0].click());

        calls.previewReminders.mockResolvedValueOnce({
            ok: true,
            data: forIds(["0135", "0136"]),
        });
        act(() => button("Next: how each one goes").click());
        await settle();
        expect(group("email")).toEqual(["Person 0135", "Person 0136"]);

        // The first pick's preview, with Vivek on it, answers now.
        first.answer({ ok: true, data: forIds(["0106", "0135", "0136"]) });
        await settle();
        expect(group("email")).toEqual(["Person 0135", "Person 0136"]);
        expect(hasButton("Send 2 emails")).toBe(true);

        // And Send sends the newer pick, never the old list.
        calls.sendReminders.mockResolvedValue({
            ok: true,
            data: EMAILED(["0135", "0136"]),
        });
        act(() => button("Send 2 emails").click());
        await settle();
        await holdEnds();
        expect(calls.sendReminders).toHaveBeenCalledWith({
            invoiceIds: ["0135", "0136"],
        });
    });

    it("a read from before a close and reopen answers to nobody", async () => {
        draw();
        const first = later();
        calls.previewReminders.mockReturnValueOnce(first.promise);
        act(() => button("Next: how each one goes").click());
        await settle();
        act(() => button("Not now").click());
        await settle();
        act(() => button("reopen").click());
        await settle();
        expect(step()).toBe("pick");
        const boxes = page().querySelectorAll<HTMLButtonElement>(
            '[data-remind-pick] button[role="checkbox"]',
        );
        act(() => boxes[0].click());
        const second = later();
        calls.previewReminders.mockReturnValueOnce(second.promise);
        act(() => button("Next: how each one goes").click());
        await settle();

        // The first opening's read answers while the second is still out.
        first.answer({ ok: true, data: forIds(["0106", "0135", "0136"]) });
        await settle();
        expect(group("email")).toEqual([]);

        second.answer({ ok: true, data: forIds(["0135", "0136"]) });
        await settle();
        expect(group("email")).toEqual(["Person 0135", "Person 0136"]);
    });
});

describe("step 3: send", () => {
    it("holds the emails ten seconds, walks WhatsApp, and ends with the tally", async () => {
        draw();
        await toStep2();
        calls.sendReminders.mockResolvedValue({
            ok: true,
            data: {
                invoices: [
                    {
                        ...reply({ invoiceId: "0135", name: "Nikhil Rao" }),
                        outcome: "EMAILED",
                    },
                ],
            },
        });
        act(() => button("Send 1 email, then WhatsApp 1").click());
        await settle();

        // Held: nothing has gone, and Undo is in the sheet.
        expect(text()).toContain("Sending 1 email in 10 seconds");
        expect(hasButton("Undo")).toBe(true);
        expect(calls.sendReminders).not.toHaveBeenCalled();
        expect(calls.toast.showUndo).toHaveBeenCalledWith(
            "Sending in 10 seconds",
            expect.any(Function),
            { description: "1 reminder from your own email." },
        );
        // The WhatsApp one is next, with the message they get.
        expect(text()).toContain("Step 3 of 3 · WhatsApp, 1 of 1");
        expect(text()).toContain("Next: Vivek Nair · ₹8,400");
        expect(page().querySelector("[data-preview]")?.textContent).toContain(
            "Hi Vivek, this is Rye & Co.",
        );

        await holdEnds();
        expect(calls.sendReminders).toHaveBeenCalledTimes(1);
        expect(calls.sendReminders).toHaveBeenCalledWith({
            invoiceIds: ["0135"],
        });
        expect(text()).toContain("1 email sent");
        expect(text()).toContain("Nikhil · each logged on its invoice");
        expect(calls.forgetLink).toHaveBeenCalledWith("0135");

        calls.openWhatsAppShare.mockResolvedValue(true);
        act(() => button("Open WhatsApp for Vivek").click());
        await settle();
        expect(calls.openWhatsAppShare).toHaveBeenCalledWith(
            "0106",
            "REMINDER",
            null,
        );

        expect(step()).toBe("done");
        expect(text()).toContain("Reminders done");
        expect(text()).toContain("3 picked · ₹10,680");
        const tally = Array.from(
            page().querySelectorAll<HTMLElement>("[data-tally]"),
        ).map((l) => l.textContent);
        expect(tally).toEqual([
            "1 emailedNikhil",
            "1 shared on WhatsAppVivek",
            "1 waits until tomorrowTara",
        ]);
        expect(reminded).toEqual([
            ["0135", "email"],
            ["0106", "whatsapp"],
        ]);
    });

    it("Undo inside the hold sends nothing and comes back to step 2", async () => {
        draw();
        await toStep2();
        act(() => button("Send 1 email, then WhatsApp 1").click());
        await settle();
        act(() => button("Undo").click());
        await settle();
        await holdEnds();
        expect(calls.sendReminders).not.toHaveBeenCalled();
        expect(step()).toBe("ways");
        expect(hasButton("Send 1 email, then WhatsApp 1")).toBe(true);
        expect(reminded).toEqual([]);
    });

    it("Undo after a WhatsApp one opened keeps the walk, and nothing is emailed", async () => {
        draw();
        await toStep2();
        act(() => button("Send 1 email, then WhatsApp 1").click());
        await settle();
        calls.openWhatsAppShare.mockResolvedValue(true);
        act(() => button("Open WhatsApp for Vivek").click());
        await settle();
        act(() => button("Undo").click());
        await settle();
        await holdEnds();
        expect(calls.sendReminders).not.toHaveBeenCalled();
        expect(step()).toBe("done");
        const tally = Array.from(
            page().querySelectorAll<HTMLElement>("[data-tally]"),
        ).map((l) => l.dataset.tally);
        expect(tally).toEqual(["whatsapp", "waits"]);
    });

    it("Skip moves on without opening WhatsApp", async () => {
        draw(ROWS.slice(0, 1));
        await toStep2({ message: null, invoices: [MIXED.invoices[0]] });
        expect(hasButton("WhatsApp 1")).toBe(true);
        act(() => button("WhatsApp 1").click());
        await settle();
        act(() => button("Skip Vivek").click());
        expect(calls.openWhatsAppShare).not.toHaveBeenCalled();
        expect(step()).toBe("done");
        expect(text()).toContain("1 skipped");
        // No email to hold: no toast, no send.
        expect(calls.toast.showUndo).not.toHaveBeenCalled();
    });

    it("a refused WhatsApp share stays on that person", async () => {
        draw(ROWS.slice(0, 1));
        await toStep2({ message: null, invoices: [MIXED.invoices[0]] });
        act(() => button("WhatsApp 1").click());
        await settle();
        calls.openWhatsAppShare.mockResolvedValue(false);
        act(() => button("Open WhatsApp for Vivek").click());
        await settle();
        expect(step()).toBe("send");
        expect(hasButton("Skip Vivek")).toBe(true);
        expect(reminded).toEqual([]);
    });
});

describe("more than 100", () => {
    it("reads and sends in calls of at most 100", async () => {
        const many = Array.from({ length: 150 }, (_, i) =>
            pick(`i${i}`, `Person ${i}`, 10000, 2),
        );
        draw(many);
        expect(text()).toContain("150 overdue shown. Ticked: 150 · ₹15,000.");
        calls.previewReminders.mockImplementation(
            ({ invoiceIds }: { invoiceIds: string[] }) =>
                Promise.resolve({
                    ok: true,
                    data: {
                        message: null,
                        invoices: invoiceIds.map((id) =>
                            reply({
                                invoiceId: id,
                                name: `Person ${id}`,
                                email: `${id}@example.com`,
                            }),
                        ),
                    },
                }),
        );
        act(() => button("Next: how each one goes").click());
        await settle();
        expect(calls.previewReminders).toHaveBeenCalledTimes(2);
        const asked = calls.previewReminders.mock.calls.map(
            ([a]) => (a as { invoiceIds: string[] }).invoiceIds.length,
        );
        expect(asked).toEqual([100, 50]);
        expect(group("email")).toHaveLength(150);

        calls.sendReminders.mockImplementation(
            ({ invoiceIds }: { invoiceIds: string[] }) =>
                Promise.resolve({ ok: true, data: EMAILED(invoiceIds) }),
        );
        act(() => button("Send 150 emails").click());
        await settle();
        await holdEnds();
        expect(
            calls.sendReminders.mock.calls.map(
                ([a]) => (a as { invoiceIds: string[] }).invoiceIds.length,
            ),
        ).toEqual([100, 50]);
        expect(step()).toBe("done");
        expect(text()).toContain("150 emailed");
        expect(reminded).toHaveLength(150);
    });
});

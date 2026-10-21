// @vitest-environment jsdom
/**
 * Remind all on Home's unpaid bills (DEC-171, Home plan U8, boards
 * `HARemindD`, `HARemindUndoD`, `HPSheets`): the sheet lists who gets a
 * reminder and who is skipped, and why, with the words they get; Send holds
 * them ten seconds with Undo on Home's one hold and then sends them in one
 * call; Undo sends nothing; the bills group's line says "Reminders going
 * to 7 people" while they wait; a bill skipped by the server when they go
 * is named; nobody to remind, a failed read and a failed send each say so;
 * and only someone who may send a reminder sees the button.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeNeedGroup } from "@/lib/home/service";
import type {
    ReminderPreview,
    ReminderRow,
    ReminderSendResult,
} from "@/lib/invoices/remind-all";

import { NeedGroups } from "./need-groups";
import { PhoneNeeds } from "./phone/phone-needs-list";

const calls = vi.hoisted(() => ({
    previewReminders: vi.fn(),
    sendReminders: vi.fn(),
    forgetLink: vi.fn(),
    toast: {
        showUndo: vi.fn(() => 1),
        showSuccess: vi.fn(),
        showError: vi.fn(),
        showWarning: vi.fn(),
        dismissToast: vi.fn(),
    },
}));

vi.mock("@/lib/api/http", () => ({}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/",
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
vi.mock("@/lib/invoices/minted-links", () => ({
    forgetLink: calls.forgetLink,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        calls.previewReminders,
        calls.sendReminders,
        calls.forgetLink,
        ...Object.values(calls.toast),
    ])
        fn.mockClear();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
});

async function settle() {
    await act(async () => {
        for (let i = 0; i < 8; i++) await Promise.resolve();
    });
}

async function holdEnds() {
    act(() => {
        vi.advanceTimersByTime(10_000);
    });
    await settle();
}

const NAMES = [
    "Shruti Menon",
    "Priya Raman",
    "Vivek Nair",
    "Isha Kulkarni",
    "Tara Pillai",
    "Om Prakash",
    "Lata Iyer",
];

const GOING: ReminderRow[] = NAMES.map((name, i) => ({
    invoiceId: `inv_${i}`,
    way: "EMAIL",
    reason: null,
    email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    number: `RC/00${i}`,
    name,
    leftToPay: "480.00",
    currency: "INR",
    dueAt: "2026-09-20T00:00:00.000Z",
    lateDays: 29 - i,
}));

const SKIPPED: ReminderRow[] = [
    {
        invoiceId: "inv_a",
        way: "WAIT",
        reason: "REMINDED_RECENTLY",
        retryAt: "2026-10-21T04:30:00.000Z",
        number: "RC/0a",
        name: "Arjun Mehta",
        leftToPay: "1800.00",
        currency: "INR",
        lateDays: 27,
        lastWords: "Reminded yesterday",
    },
    {
        invoiceId: "inv_b",
        way: "WAIT",
        reason: "REMINDED_RECENTLY",
        retryAt: "2026-10-20T04:30:00.000Z",
        number: "RC/0b",
        name: "Meera Nair",
        leftToPay: "480.00",
        currency: "INR",
        lateDays: 27,
        lastWords: "Reminded 2 days ago",
    },
    {
        invoiceId: "inv_c",
        way: "NONE",
        reason: "UNREACHABLE",
        emailBlocked: "NO_EMAIL_ADDRESS",
        number: "RC/0c",
        name: "Rahul Bose",
        leftToPay: "960.00",
        currency: "INR",
        lateDays: 27,
    },
];

const IDS = [...GOING, ...SKIPPED].map((r) => r.invoiceId);

function preview(over: Partial<ReminderPreview> = {}): ReminderPreview {
    return {
        invoices: [...GOING, ...SKIPPED],
        message:
            "Hi Shruti,\nInvoice RC/000 for ₹480.00 was due on 20 Sep 2026 and hasn't been paid yet.\nYou can pay it by UPI or card here: [their own link]",
        ...over,
    };
}

function sent(
    outcome: (row: ReminderRow) => ReminderSendResult["invoices"][number] = (
        row,
    ) => ({ ...row, outcome: "EMAILED" }),
): ReminderSendResult {
    return { invoices: GOING.map(outcome) };
}

const BILLS: HomeNeedGroup = {
    kind: "BILLS",
    count: 10,
    late: 10,
    totals: [{ currency: "INR", amountMinor: 3297000 }],
    oldest: null,
    rows: [],
    more: 0,
    href: "/billing/invoices?view=overdue",
    codes: ["PAYMENTS_OVERDUE_INVOICES"],
    remind: { invoiceIds: IDS, quietDays: 3 },
} as unknown as HomeNeedGroup;

/** Home's groups; without `remind` the API said they may not send one. */
function draw(mayRemind = true) {
    const group = mayRemind ? BILLS : { ...BILLS, remind: undefined };
    act(() =>
        root.render(
            <NeedGroups
                groups={[group]}
                total={10}
                inProgress={0}
                unavailable={[]}
                next=""
            />,
        ),
    );
}

const page = () => document.body;
const buttons = (el: ParentNode = page()) =>
    Array.from(el.querySelectorAll("button"));
const button = (name: string, el: ParentNode = page()) => {
    const found = buttons(el).find((b) => b.textContent === name);
    if (!found) throw new Error(`no button ${name}`);
    return found;
};
const hasButton = (name: string, el: ParentNode = page()) =>
    buttons(el).some((b) => b.textContent === name);
const sheet = () =>
    page().querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
const billsLine = () =>
    host.querySelector('[data-need-group="BILLS"]')?.textContent ?? "";

async function openSheet(with_ = preview()) {
    calls.previewReminders.mockResolvedValue({ ok: true, data: with_ });
    act(() => button("Remind all").click());
    await settle();
}

describe("Remind all", () => {
    it("sits before See bills, for someone who may send a reminder", () => {
        draw();
        const order = Array.from(
            host.querySelectorAll(
                '[data-need-group="BILLS"] a, [data-need-group="BILLS"] button',
            ),
        ).map((el) => el.textContent);
        expect(order.indexOf("Remind all")).toBeLessThan(
            order.indexOf("See bills"),
        );
    });

    it("isn't offered to a role that can't send reminders", () => {
        draw(false);
        expect(hasButton("Remind all", host)).toBe(false);
        expect(host.textContent).toContain("See bills");
    });

    it("lists who gets one, who is skipped and why, and what they get", async () => {
        draw();
        await openSheet();
        const s = sheet();
        expect(s).not.toBeNull();
        const text = s?.textContent ?? "";
        expect(text).toContain("Unpaid bills");
        expect(text).toContain("Remind all");
        expect(text).toContain("7 people owe ₹3,360 on overdue bills.");
        expect(text).toContain("What they get");
        expect(text).toContain("Hi Shruti,");
        expect(text).toContain(
            "By email from your own address. Each person sees only their own bill.",
        );
        // Saroh sends no WhatsApp: with nobody on a phone only, no word of it.
        expect(text).not.toContain("WhatsApp");
        // It asked for these bills, waiting anyone heard from in 3 days.
        expect(calls.previewReminders).toHaveBeenCalledWith({
            invoiceIds: IDS,
            quietDays: 3,
        });
        const going = s?.querySelectorAll('[data-remind-row="going"]') ?? [];
        expect(going).toHaveLength(7);
        expect(going[0]?.textContent).toContain("Shruti Menon");
        expect(going[0]?.textContent).toContain("Late 29 days");
        expect(going[0]?.textContent).toContain("₹480");
        expect(text).toContain(
            "3 skipped · reminded in the last 3 days, or no way to reach them",
        );
        const skipped =
            s?.querySelectorAll('[data-remind-row="skipped"]') ?? [];
        expect(Array.from(skipped).map((r) => r.textContent)).toEqual([
            expect.stringContaining("Reminded yesterday"),
            expect.stringContaining("Reminded 2 days ago"),
            expect.stringContaining("No email or phone to reach them"),
        ]);
        expect(hasButton("Send 7 reminders")).toBe(true);
        expect(hasButton("Cancel")).toBe(true);
        // Nothing went just by opening it.
        expect(calls.sendReminders).not.toHaveBeenCalled();
    });

    it("holds them ten seconds with Undo, then sends them in one call", async () => {
        draw();
        await openSheet();
        calls.sendReminders.mockResolvedValue({ ok: true, data: sent() });
        act(() => button("Send 7 reminders").click());
        await settle();

        expect(sheet()).toBeNull();
        expect(calls.toast.showUndo).toHaveBeenCalledWith(
            "7 reminders go out in 10 seconds. 3 skipped.",
            expect.any(Function),
            { duration: 10_000 },
        );
        expect(calls.sendReminders).not.toHaveBeenCalled();
        // The bills group says they're on their way, and Remind all steps aside.
        expect(billsLine()).toContain(
            "Reminders going to 7 people · 3 skipped: reminded in the last 3 days, or no way to reach them",
        );
        expect(billsLine()).toContain("Sending");
        expect(hasButton("Remind all", host)).toBe(false);
        expect(host.textContent).toContain("See bills");

        await holdEnds();
        expect(calls.sendReminders).toHaveBeenCalledTimes(1);
        // Only the ones going, and the server checks the 3 days again.
        expect(calls.sendReminders).toHaveBeenCalledWith({
            invoiceIds: NAMES.map((_, i) => `inv_${i}`),
            quietDays: 3,
        });
        expect(calls.toast.showSuccess).toHaveBeenCalledWith(
            "7 reminders sent",
            undefined,
        );
        expect(calls.forgetLink).toHaveBeenCalledTimes(7);
        expect(billsLine()).toContain("7 reminders sent today");
    });

    it("Undo within the ten seconds sends nothing and puts the line back", async () => {
        draw();
        await openSheet();
        act(() => button("Send 7 reminders").click());
        await settle();
        const [, undo] = (calls.toast.showUndo.mock.calls[0] ??
            []) as unknown as [string, () => void];
        await act(async () => {
            undo();
            await Promise.resolve();
        });
        await settle();
        await holdEnds();
        expect(calls.sendReminders).not.toHaveBeenCalled();
        expect(calls.toast.showSuccess).toHaveBeenCalledWith(
            "Nothing was sent.",
        );
        expect(billsLine()).not.toContain("Reminders going");
        expect(hasButton("Remind all", host)).toBe(true);
    });

    it("names a bill the server skipped because it was reminded meanwhile", async () => {
        draw();
        await openSheet();
        calls.sendReminders.mockResolvedValue({
            ok: true,
            data: sent((row) =>
                row.invoiceId === "inv_0"
                    ? {
                          ...row,
                          way: "WAIT",
                          reason: "REMINDED_TODAY",
                          lastWords: "Reminded today",
                          outcome: "NOT_SENT",
                      }
                    : { ...row, outcome: "EMAILED" },
            ),
        });
        act(() => button("Send 7 reminders").click());
        await settle();
        await holdEnds();
        expect(calls.toast.showSuccess).toHaveBeenCalledWith(
            "6 reminders sent",
            "Skipped: Shruti Menon (reminded today).",
        );
    });

    it("says so when the send fails, and nothing is marked sent", async () => {
        draw();
        await openSheet();
        calls.sendReminders.mockResolvedValue({
            ok: false,
            error: "Add your business details first.",
        });
        act(() => button("Send 7 reminders").click());
        await settle();
        await holdEnds();
        expect(calls.toast.showError).toHaveBeenCalledWith(
            "Those reminders weren't sent.",
            "Add your business details first.",
        );
        expect(billsLine()).not.toContain("Reminders going");
        expect(hasButton("Remind all", host)).toBe(true);
    });

    it("says why nobody can be reminded, with no Send", async () => {
        draw();
        await openSheet(
            preview({
                message: null,
                invoices: [...GOING, ...SKIPPED].map((r) => ({
                    ...r,
                    way: "NONE" as const,
                    reason: "UNREACHABLE" as const,
                    emailBlocked: "NO_EMAIL_PROVIDER" as const,
                })),
            }),
        );
        const text = sheet()?.textContent ?? "";
        expect(text).toContain("Reminders go from your own email");
        expect(text).toContain(
            "Connect an email provider in Settings › Providers to send them.",
        );
        expect(
            Array.from(sheet()?.querySelectorAll("a") ?? []).some(
                (a) => a.getAttribute("href") === "/settings/providers",
            ),
        ).toBe(true);
        expect(buttons().some((b) => b.textContent.startsWith("Send"))).toBe(
            false,
        );
    });

    it("says the read failed, sent nothing, and tries again", async () => {
        draw();
        calls.previewReminders.mockResolvedValue({
            ok: false,
            error: "The server didn't answer.",
        });
        act(() => button("Remind all").click());
        await settle();
        expect(sheet()?.textContent).toContain("who owes you");
        expect(sheet()?.textContent).toContain("Nothing was sent.");
        expect(hasButton("Send 7 reminders")).toBe(false);
        calls.previewReminders.mockResolvedValue({
            ok: true,
            data: preview(),
        });
        act(() => button("Try again").click());
        await settle();
        expect(hasButton("Send 7 reminders")).toBe(true);
    });

    it("leaves amounts out for a role without money", async () => {
        draw();
        await openSheet({
            // The email names the amount: not for a role without money.
            message: null,
            invoices: [...GOING, ...SKIPPED].map(
                ({ leftToPay: _amount, ...r }) => r,
            ),
        });
        const text = sheet()?.textContent ?? "";
        expect(text).toContain("7 people have overdue bills to remind.");
        expect(text).not.toContain("₹480");
        expect(text).not.toContain("₹1,800");
    });

    it("names someone with only a phone, to remind on WhatsApp from the bill, and sends them nothing", async () => {
        draw();
        await openSheet(
            preview({
                invoices: [
                    ...GOING,
                    {
                        invoiceId: "inv_w",
                        way: "WHATSAPP",
                        reason: "NO_EMAIL_ADDRESS",
                        phone: "+919800000001",
                        number: "RC/0w",
                        name: "Kiran Rao",
                        leftToPay: "300.00",
                        currency: "INR",
                        lateDays: 5,
                    },
                ],
            }),
        );
        const text = sheet()?.textContent ?? "";
        expect(text).toContain(
            "1 skipped · no email, so WhatsApp from the bill",
        );
        expect(text).toContain("No email address · WhatsApp from the bill");
        expect(text).toContain("Anyone with only a phone number is below");
        calls.sendReminders.mockResolvedValue({ ok: true, data: sent() });
        act(() => button("Send 7 reminders").click());
        await settle();
        await holdEnds();
        const [ask] = calls.sendReminders.mock.calls[0] as [
            { invoiceIds: string[] },
        ];
        expect(ask.invoiceIds).not.toContain("inv_w");
    });

    it("is in the phone's bills sheet beside See bills, with the same hold", async () => {
        act(() =>
            root.render(
                <PhoneNeeds
                    groups={[BILLS]}
                    total={10}
                    inProgress={0}
                    unavailable={[]}
                />,
            ),
        );
        act(() =>
            host
                .querySelector<HTMLButtonElement>('[data-phone-line="BILLS"]')
                ?.click(),
        );
        await settle();
        const bills = page().querySelector('[data-home-sheet="BILLS"]');
        expect(bills).not.toBeNull();
        const foot = Array.from(bills?.querySelectorAll("a, button") ?? []).map(
            (el) => el.textContent,
        );
        expect(foot.indexOf("See bills")).toBeLessThan(
            foot.indexOf("Remind all"),
        );
        await openSheet();
        calls.sendReminders.mockResolvedValue({ ok: true, data: sent() });
        act(() => button("Send 7 reminders").click());
        await settle();
        expect(
            page().querySelector("[data-remind-status]")?.textContent,
        ).toContain("Reminders going to 7 people");
        expect(
            host.querySelector('[data-phone-line="BILLS"]')?.textContent,
        ).toContain("Sending");
        await holdEnds();
        expect(calls.sendReminders).toHaveBeenCalledTimes(1);
    });

    it("has the hold's Undo in the phone's bills sheet, over the toast", async () => {
        act(() =>
            root.render(
                <PhoneNeeds
                    groups={[BILLS]}
                    total={10}
                    inProgress={0}
                    unavailable={[]}
                />,
            ),
        );
        act(() =>
            host
                .querySelector<HTMLButtonElement>('[data-phone-line="BILLS"]')
                ?.click(),
        );
        await settle();
        await openSheet();
        act(() => button("Send 7 reminders").click());
        await settle();
        const status = page().querySelector("[data-remind-status]");
        expect(status).not.toBeNull();
        await act(async () => {
            if (status) button("Undo", status).click();
            await Promise.resolve();
        });
        await settle();
        await holdEnds();
        expect(calls.sendReminders).not.toHaveBeenCalled();
        expect(page().querySelector("[data-remind-status]")).toBeNull();
        expect(hasButton("Remind all")).toBe(true);
    });

    // Review #12: a read from an earlier opening that answers last must not
    // overwrite the newer one, or the old list is what gets sent.
    it("keeps the newest read when an older one answers last", async () => {
        draw();
        let answerOld: (v: unknown) => void = () => undefined;
        calls.previewReminders.mockReturnValueOnce(
            new Promise((resolve) => {
                answerOld = resolve;
            }),
        );
        act(() => button("Remind all").click());
        await settle();
        act(() => button("Cancel").click());
        await settle();

        calls.previewReminders.mockResolvedValueOnce({
            ok: true,
            data: preview(),
        });
        act(() => button("Remind all").click());
        await settle();
        expect(hasButton("Send 7 reminders")).toBe(true);

        // The first opening's read lands now, with only one person on it.
        answerOld({
            ok: true,
            data: preview({ invoices: [GOING[0]] }),
        });
        await settle();
        expect(hasButton("Send 7 reminders")).toBe(true);
        expect(hasButton("Send 1 reminder")).toBe(false);
    });

    it("a retry's answer wins over the failed read it replaced", async () => {
        draw();
        let answerOld: (v: unknown) => void = () => undefined;
        calls.previewReminders.mockReturnValueOnce(
            new Promise((resolve) => {
                answerOld = resolve;
            }),
        );
        act(() => button("Remind all").click());
        await settle();
        act(() => button("Cancel").click());
        await settle();
        calls.previewReminders.mockResolvedValueOnce({
            ok: true,
            data: preview(),
        });
        act(() => button("Remind all").click());
        await settle();
        answerOld({ ok: false, error: "The server didn't answer." });
        await settle();
        expect(sheet()?.textContent).not.toContain("Nothing was sent.");
        expect(hasButton("Send 7 reminders")).toBe(true);
    });
});

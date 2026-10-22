// @vitest-environment jsdom
/**
 * "Emails to your customers" (DEC-174, U4 #1135), the sheet: one switch
 * per email the business is offered, with what the customer gets. A
 * switch saves as it is flipped, with Undo that saves it back; a refused
 * save goes back and says so. One note at most. Someone without
 * `comms:manage` sees every switch, fixed, and why.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type {
    CustomerEmail,
    CustomerEmails,
} from "@/lib/communications/customer-emails";

import { CustomerEmailsSheet } from "./customer-emails-sheet";

const setCustomerEmail = vi.fn();
const setOverdueTiming = vi.fn();
vi.mock("@/lib/communications/customer-emails-actions", () => ({
    setCustomerEmail: (...a: unknown[]) => setCustomerEmail(...a) as unknown,
    setOverdueTiming: (...a: unknown[]) => setOverdueTiming(...a) as unknown,
}));
// A plain select stands in for the Radix one, which jsdom can't open.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        id,
        value,
        onValueChange,
        options,
        readOnly,
    }: {
        id?: string;
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        readOnly?: boolean;
    }) => (
        <select
            id={id}
            value={value}
            disabled={readOnly}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));
const offer = vi.fn();
vi.mock(
    "@/components/organizations/business-settings/use-settings-undo",
    () => ({
        useSettingsUndo: () => ({ offer, settle: vi.fn() }),
    }),
);
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => showError(...a) as unknown,
}));
vi.mock("@saroh/ui/sheet", async () =>
    (
        await import("@/components/commerce/product-settings/test-kit")
    ).sheetMock(),
);

const email = (
    kind: string,
    label: string,
    over: Partial<CustomerEmail> = {},
): CustomerEmail => ({
    kind,
    label,
    says: `What ${label} sends.`,
    on: true,
    default: true,
    offered: true,
    reason: null,
    why: null,
    ...over,
});

const state = (over: Partial<CustomerEmails> = {}): CustomerEmails => ({
    notices: [
        email("MEMBERSHIP", "Membership emails"),
        email("REFUND", "Refunds"),
        email("OVERDUE_REMINDERS", "Overdue reminders", {
            on: false,
            default: false,
        }),
    ],
    canChange: true,
    emailConnected: true,
    ...over,
});

const s = stage();
const onClose = vi.fn();
const render = (st = state()) =>
    s.render(<CustomerEmailsSheet state={st} open onClose={onClose} />);

function switchFor(label: string): HTMLButtonElement {
    const found = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    ).find((el) => el.getAttribute("aria-label") === label);
    if (!found) throw new Error(`No switch "${label}"`);
    return found;
}
const isOn = (label: string) =>
    switchFor(label).getAttribute("aria-checked") === "true";

async function flip(label: string) {
    await act(async () => {
        switchFor(label).click();
        for (let i = 0; i < 10; i++) await Promise.resolve();
    });
}

beforeEach(() => {
    s.mount();
    for (const m of [
        setCustomerEmail,
        setOverdueTiming,
        offer,
        showError,
        onClose,
    ])
        m.mockReset();
    setCustomerEmail.mockResolvedValue({ ok: true, data: state() });
    setOverdueTiming.mockResolvedValue({ ok: true, data: state() });
});
afterEach(() => s.unmount());

describe("the switches", () => {
    it("one per email offered, each with what the customer gets, as saved", () => {
        render();
        const sheet = s.sheet();
        expect(s.title(sheet)).toBe("Emails to your customers");
        expect(sheet?.textContent).toContain(
            "Each switch saves as you flip it.",
        );
        expect(document.querySelectorAll('[role="switch"]').length).toBe(3);
        expect(sheet?.textContent).toContain("What Refunds sends.");
        expect(isOn("Membership emails")).toBe(true);
        expect(isOn("Overdue reminders")).toBe(false);
        // Nothing to warn about with an email connected.
        expect(sheet?.querySelector('[role="note"]')).toBe(null);
        // Saved as flipped: the foot is one Done.
        expect(s.button("Done", sheet)).toBeDefined();
        expect(s.button("Save", sheet)).toBeUndefined();
    });

    it("turning one off saves it at once, and offers Undo that turns it back on", async () => {
        render();
        await flip("Membership emails");

        expect(setCustomerEmail).toHaveBeenCalledWith({
            kind: "MEMBERSHIP",
            on: false,
        });
        expect(showError).not.toHaveBeenCalled();
        expect(offer).toHaveBeenCalledTimes(1);
        const [message, undo] = offer.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(message).toBe("Membership emails turned off.");

        await act(async () => {
            await expect(undo()).resolves.toEqual({ ok: true });
        });
        expect(setCustomerEmail).toHaveBeenLastCalledWith({
            kind: "MEMBERSHIP",
            on: true,
        });
    });

    it("turning one on that starts off says so", async () => {
        render();
        await flip("Overdue reminders");
        expect(setCustomerEmail).toHaveBeenCalledWith({
            kind: "OVERDUE_REMINDERS",
            on: true,
        });
        expect(offer.mock.calls[0]?.[0]).toBe("Overdue reminders turned on.");
    });

    it("a refused Undo says why", async () => {
        render();
        await flip("Refunds");
        setCustomerEmail.mockResolvedValue({
            ok: false,
            error: "That email isn't one this business sends.",
        });
        const undo = offer.mock.calls[0]?.[1] as () => Promise<unknown>;
        await act(async () => {
            await expect(undo()).resolves.toEqual({
                ok: false,
                error: "That email isn't one this business sends.",
            });
        });
    });

    it("a refused save says so, offers no Undo, and the switch goes back", async () => {
        setCustomerEmail.mockResolvedValue({
            ok: false,
            error: "Connect your email first.",
        });
        render();
        await flip("Refunds");
        expect(showError).toHaveBeenCalledWith(
            "Connect your email first.",
            "Nothing has changed.",
        );
        expect(offer).not.toHaveBeenCalled();
        expect(isOn("Refunds")).toBe(true);
    });

    it("Done closes it", () => {
        render();
        s.press("Done", s.sheet());
        expect(onClose).toHaveBeenCalled();
    });
});

describe("with no email provider", () => {
    const enquiry = email("ENQUIRY_REPLY", "Enquiry replies", {
        offered: false,
        reason: "NO_EMAIL",
        why: "Connect your email first",
    });

    it("one note says none go out yet; the switches still save", async () => {
        render(
            state({
                emailConnected: false,
                notices: [...state().notices, enquiry],
            }),
        );
        const notes = s.sheet()?.querySelectorAll('[role="note"]') ?? [];
        expect(notes).toHaveLength(1);
        expect(notes[0]?.textContent).toBe(
            "None of these go out until your email is connected. What you choose here still saves.",
        );
        // Said once: not again on the enquiry reply's row.
        expect(s.sheet()?.textContent).not.toContain(
            "Connect your email first",
        );
        expect(switchFor("Enquiry replies").disabled).toBe(true);
        expect(switchFor("Refunds").disabled).toBe(false);

        await flip("Refunds");
        expect(setCustomerEmail).toHaveBeenCalledWith({
            kind: "REFUND",
            on: false,
        });
    });

    it("the one that can't change yet isn't sent when pressed", async () => {
        render(state({ emailConnected: false, notices: [enquiry] }));
        await flip("Enquiry replies");
        expect(setCustomerEmail).not.toHaveBeenCalled();
    });
});

describe("for someone who can't change them", () => {
    it("every switch is shown, fixed, with why under the title and Close", async () => {
        render(state({ canChange: false }));
        const sheet = s.sheet();
        expect(sheet?.textContent).toContain(
            "Your role can read these emails but not change them. An owner or admin can change this in Settings › Team.",
        );
        expect(sheet?.textContent).not.toContain(
            "Each switch saves as you flip it.",
        );
        for (const label of [
            "Membership emails",
            "Refunds",
            "Overdue reminders",
        ]) {
            expect(switchFor(label).disabled).toBe(true);
        }
        expect(isOn("Membership emails")).toBe(true);
        expect(s.button("Close", sheet)).toBeDefined();

        await flip("Refunds");
        expect(setCustomerEmail).not.toHaveBeenCalled();
    });
});

describe("when overdue reminders go (DEC-178, #1169)", () => {
    const timing = { firstDay: 3, secondDay: 10, fromHour: 9, untilHour: 20 };
    const overdue = (over: Partial<CustomerEmail> = {}) =>
        email("OVERDUE_REMINDERS", "Overdue reminders", {
            on: true,
            default: false,
            timing,
            ...over,
        });
    const timed = (over: Partial<CustomerEmails> = {}, o = overdue()) =>
        state({ notices: [email("REFUND", "Refunds"), o], ...over });

    const group = () =>
        document.querySelector<HTMLElement>('[data-testid="overdue-timing"]');
    function selectFor(label: string): HTMLSelectElement {
        const found = Array.from(group()?.querySelectorAll("label") ?? []).find(
            (l) => l.textContent === label,
        );
        const control = found ? document.getElementById(found.htmlFor) : null;
        if (!(control instanceof HTMLSelectElement)) {
            throw new Error(`No select "${label}"`);
        }
        return control;
    }
    const chosen = (label: string) => {
        const el = selectFor(label);
        return el.selectedOptions.item(0)?.textContent;
    };
    async function choose(label: string, value: string) {
        await act(async () => {
            const el = selectFor(label);
            el.value = value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            for (let i = 0; i < 10; i++) await Promise.resolve();
        });
    }

    it("while on, shows the days and hours, as saved, in words", () => {
        render(timed());
        expect(group()?.getAttribute("aria-label")).toBe(
            "When overdue reminders go",
        );
        expect(chosen("First reminder")).toBe("3 days after it's due");
        expect(chosen("Second reminder")).toBe("10 days after it's due");
        expect(chosen("From")).toBe("9 am");
        expect(chosen("Until")).toBe("8 pm");
        expect(group()?.textContent).toContain("In your business's time zone.");
    });

    it("while off, or for a kind without timing, shows none", () => {
        render(timed({}, overdue({ on: false })));
        expect(group()).toBe(null);
    });

    it("the second offers only days after the first, the end only hours after the start", () => {
        render(timed());
        const second = Array.from(selectFor("Second reminder").options);
        expect(second[0]?.textContent).toBe("4 days after it's due");
        expect(second.at(-1)?.textContent).toBe("60 days after it's due");
        const until = Array.from(selectFor("Until").options);
        expect(until[0]?.textContent).toBe("10 am");
        expect(until.at(-1)?.textContent).toBe("midnight");
    });

    it("a choice saves at once, all four together, with Undo that puts the old timing back", async () => {
        render(timed());
        await choose("First reminder", "5");
        expect(setOverdueTiming).toHaveBeenCalledWith({
            ...timing,
            firstDay: 5,
        });
        const [message, undo] = offer.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(message).toBe("Overdue reminder timing saved.");
        await act(async () => {
            await expect(undo()).resolves.toEqual({ ok: true });
        });
        expect(setOverdueTiming).toHaveBeenLastCalledWith(timing);
    });

    it("a first day past the second moves the second along; a start past the end moves the end", async () => {
        render(timed());
        await choose("First reminder", "12");
        expect(setOverdueTiming).toHaveBeenLastCalledWith({
            ...timing,
            firstDay: 12,
            secondDay: 13,
        });
    });

    it("the start moved past the end takes the end with it", async () => {
        render(timed());
        await choose("From", "21");
        expect(setOverdueTiming).toHaveBeenLastCalledWith({
            ...timing,
            fromHour: 21,
            untilHour: 22,
        });
    });

    it("a refused save says so, offers no Undo, and the choice goes back", async () => {
        setOverdueTiming.mockResolvedValue({
            ok: false,
            error: "Reminders stop later in the day than they start.",
        });
        render(timed());
        await choose("Until", "18");
        expect(showError).toHaveBeenCalledWith(
            "Reminders stop later in the day than they start.",
            "Nothing has changed.",
        );
        expect(offer).not.toHaveBeenCalled();
        expect(chosen("Until")).toBe("8 pm");
    });

    it("someone who can't change them reads the timing, fixed", async () => {
        render(timed({ canChange: false }));
        expect(chosen("First reminder")).toBe("3 days after it's due");
        expect(selectFor("First reminder").disabled).toBe(true);
        await choose("First reminder", "5");
        expect(setOverdueTiming).not.toHaveBeenCalled();
    });
});

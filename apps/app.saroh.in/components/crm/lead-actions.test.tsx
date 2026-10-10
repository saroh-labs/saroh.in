// @vitest-environment jsdom
/**
 * The lead page reads first (owner, 10 Oct): one row of buttons, each
 * opening a side sheet with its form. Nothing is open until a button is
 * pressed; a refusal keeps the sheet open with what was typed; a success
 * closes it and gives the keyboard back to the button; and Send message is
 * never a dead button without its reason.
 *
 * `react-dom/client` + `act` directly, as the other component tests do, on
 * the real sheet: its dialog role, name and focus return are what is tested.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComposerGate } from "@/lib/messages/composer-gate";
import type { MessageChannel } from "@/lib/messages/constants";

import { LeadActions } from "./lead-actions";

const logActivity = vi.fn();
const createTask = vi.fn();
vi.mock("@/lib/leads/actions", () => ({
    logActivity: (...args: unknown[]) => logActivity(...args) as unknown,
    createTask: (...args: unknown[]) => createTask(...args) as unknown,
}));
const sendMessage = vi.fn();
vi.mock("@/lib/messages/actions", () => ({
    sendMessage: (...args: unknown[]) => sendMessage(...args) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const showSuccess = vi.fn();
const showError = vi.fn();
const showWarning = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showWarning: (...args: unknown[]) => showWarning(...args) as unknown,
}));
// The calendar popover is `@saroh/ui`'s to test; here a day is one press.
vi.mock("@saroh/ui/date-picker", () => ({
    DatePicker: ({
        value,
        onValueChange,
    }: {
        value?: Date;
        onValueChange: (value: Date) => void;
    }) => (
        <button
            type="button"
            onClick={() => onValueChange(new Date(2099, 0, 5))}
        >
            {value ? "5 Jan 2099" : "Pick a date"}
        </button>
    ),
}));

const COMPOSE: Record<MessageChannel, ComposerGate> = {
    EMAIL: { kind: "compose" },
    WHATSAPP: { kind: "compose" },
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const mock of [
        logActivity,
        createTask,
        sendMessage,
        refresh,
        showSuccess,
        showError,
        showWarning,
    ]) {
        mock.mockReset();
    }
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function render(
    over: Partial<{
        contactId: string | null;
        gates: Record<MessageChannel, ComposerGate>;
        revoked: boolean;
    }> = {},
) {
    act(() =>
        root.render(
            <LeadActions
                leadId="lead_1"
                contactId={
                    over.contactId === undefined ? "con_1" : over.contactId
                }
                consent={over.revoked ? { EMAIL: "REVOKED" } : {}}
                gates={over.gates ?? COMPOSE}
            />,
        ),
    );
}

/** A button by its words, on the page or in the sheet (a portal). */
function button(name: string, within: ParentNode | null = document.body) {
    return Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent.trim() === name,
    );
}

const dialog = () => document.body.querySelector<HTMLElement>("[role=dialog]");

/** The open sheet's accessible name: its title, through `aria-labelledby`. */
function dialogName() {
    const id = dialog()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
}

async function press(el: HTMLElement | undefined) {
    if (!el) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

function type(el: Element | null | undefined, value: string) {
    if (!el) throw new Error("No field");
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    act(() => {
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function submit() {
    const form = dialog()?.querySelector("form");
    if (!form) throw new Error("No form");
    await act(async () => {
        form.requestSubmit();
        await new Promise((r) => setTimeout(r, 0));
    });
    // A closing sheet hands the keyboard back on the next tick.
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

describe("the lead's actions", () => {
    it("shows three buttons and no form until one is pressed", () => {
        render();
        expect(button("Add note")).toBeDefined();
        expect(button("Schedule follow-up")).toBeDefined();
        expect(button("Send message")).toBeDefined();
        expect(dialog()).toBe(null);
        expect(document.body.querySelector("textarea, input, form")).toBe(null);
    });

    it("opens a sheet named for each button", async () => {
        render();
        for (const name of ["Add note", "Schedule follow-up", "Send message"]) {
            await press(button(name, host));
            expect(dialogName()).toBe(name);
            // Cancel and the sheet's own button are both in it.
            expect(button("Cancel", dialog())).toBeDefined();
            await press(button("Cancel", dialog()));
            expect(dialog()).toBe(null);
        }
    });
});

describe("Add note", () => {
    it("keeps the sheet open with what was typed when it is refused", async () => {
        logActivity.mockResolvedValue({
            ok: false,
            error: "Your role can't add notes to a lead.",
        });
        render();
        await press(button("Add note", host));
        type(dialog()?.querySelector("textarea"), "Called, wants a quote");
        await submit();

        expect(logActivity).toHaveBeenCalledWith(
            "lead_1",
            "Called, wants a quote",
        );
        expect(showError).toHaveBeenCalledWith(
            "Your role can't add notes to a lead.",
        );
        expect(dialogName()).toBe("Add note");
        expect(dialog()?.querySelector("textarea")?.value).toBe(
            "Called, wants a quote",
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("closes on success, says so, and gives the keyboard back", async () => {
        logActivity.mockResolvedValue({ ok: true, data: { id: "act_1" } });
        render();
        await press(button("Add note", host));
        type(dialog()?.querySelector("textarea"), "  Called  ");
        await submit();

        expect(logActivity).toHaveBeenCalledWith("lead_1", "Called");
        expect(showSuccess).toHaveBeenCalledWith("Note added");
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(dialog()).toBe(null);
        expect(document.activeElement).toBe(button("Add note", host));
    });

    it("has nothing to send while the note is empty", async () => {
        render();
        await press(button("Add note", host));
        expect(button("Add note", dialog())?.disabled).toBe(true);
        type(dialog()?.querySelector("textarea"), "   ");
        expect(button("Add note", dialog())?.disabled).toBe(true);
    });
});

describe("Schedule follow-up", () => {
    async function fill() {
        await press(button("Schedule follow-up", host));
        type(dialog()?.querySelector("input"), "Send the quote");
        await press(button("Pick a date", dialog()));
    }

    it("needs what to do and a day before it can be added", async () => {
        render();
        await press(button("Schedule follow-up", host));
        expect(button("Add follow-up", dialog())?.disabled).toBe(true);
        type(dialog()?.querySelector("input"), "Send the quote");
        expect(button("Add follow-up", dialog())?.disabled).toBe(true);
        await press(button("Pick a date", dialog()));
        expect(button("Add follow-up", dialog())?.disabled).toBe(false);
    });

    it("keeps the sheet open with what was filled in when it is refused", async () => {
        createTask.mockResolvedValue({ ok: false, error: "Not allowed." });
        render();
        await fill();
        await submit();

        expect(showError).toHaveBeenCalledWith("Not allowed.");
        expect(dialogName()).toBe("Schedule follow-up");
        expect(dialog()?.querySelector("input")?.value).toBe("Send the quote");
        expect(button("5 Jan 2099", dialog())).toBeDefined();
    });

    it("closes on success with the day and time joined", async () => {
        createTask.mockResolvedValue({ ok: true, data: { id: "act_2" } });
        render();
        await fill();
        await submit();

        expect(createTask).toHaveBeenCalledWith("lead_1", {
            body: "Send the quote",
            dueAt: new Date(2099, 0, 5, 9, 0).toISOString(),
        });
        expect(showSuccess).toHaveBeenCalledWith("Follow-up scheduled");
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(dialog()).toBe(null);
        expect(document.activeElement).toBe(button("Schedule follow-up", host));
    });
});

describe("Send message", () => {
    it("keeps the sheet open with the message when it is refused", async () => {
        sendMessage.mockResolvedValue({ ok: false, error: "Try again." });
        render();
        await press(button("Send message", host));
        type(dialog()?.querySelector("input"), "Your quote");
        type(dialog()?.querySelector("textarea"), "Here it is.");
        await submit();

        expect(sendMessage).toHaveBeenCalledWith({
            leadId: "lead_1",
            channel: "EMAIL",
            contactId: "con_1",
            subject: "Your quote",
            body: "Here it is.",
        });
        expect(showError).toHaveBeenCalledTimes(1);
        expect(dialogName()).toBe("Send message");
        expect(dialog()?.querySelector("input")?.value).toBe("Your quote");
        expect(dialog()?.querySelector("textarea")?.value).toBe("Here it is.");
    });

    it("closes once the message is queued", async () => {
        sendMessage.mockResolvedValue({
            ok: true,
            data: { status: "QUEUED" },
        });
        render();
        await press(button("Send message", host));
        type(dialog()?.querySelector("textarea"), "Here it is.");
        await submit();

        expect(showSuccess).toHaveBeenCalledWith("Message queued");
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(dialog()).toBe(null);
        expect(document.activeElement).toBe(button("Send message", host));
    });

    it("warns before and after a send that consent suppresses", async () => {
        sendMessage.mockResolvedValue({
            ok: true,
            data: { status: "SUPPRESSED" },
        });
        render({ revoked: true });
        await press(button("Send message", host));
        expect(dialog()?.textContent).toContain(
            "This contact has revoked Email consent. Sending will be suppressed (recorded, but not delivered).",
        );
        type(dialog()?.querySelector("textarea"), "Here it is.");
        await submit();

        expect(showWarning).toHaveBeenCalledWith(
            "Message suppressed: consent is revoked",
        );
        expect(showSuccess).not.toHaveBeenCalled();
        expect(dialog()).toBe(null);
    });

    it("says why a channel can't send in place of its fields", async () => {
        render({
            gates: {
                EMAIL: {
                    kind: "connect",
                    title: "Connect your email to write from here.",
                    cta: "Connect email",
                    href: "/settings/providers",
                },
                WHATSAPP: { kind: "compose" },
            },
        });
        await press(button("Send message", host));

        expect(dialog()?.textContent).toContain(
            "Connect your email to write from here.",
        );
        expect(
            dialog()?.querySelector('a[href="/settings/providers"]'),
        ).not.toBe(null);
        expect(dialog()?.querySelector("textarea")).toBe(null);
        expect(button("Send message", dialog())).toBeUndefined();
        expect(button("Close", dialog())).toBeDefined();
    });

    it("is off with its reason when the lead has no contact", () => {
        render({ contactId: null });
        const send = button("Send message", host);
        expect(send?.disabled).toBe(true);
        const reason = document.getElementById(
            send?.getAttribute("aria-describedby") ?? "",
        );
        expect(reason?.textContent).toBe(
            "Link a contact to this lead to send a message.",
        );
    });

    it("is off with where to turn messaging on, for someone who may", () => {
        const off: ComposerGate = { kind: "off", canManage: true };
        render({ gates: { EMAIL: off, WHATSAPP: off } });
        const send = button("Send message", host);
        expect(send?.disabled).toBe(true);
        const reason = document.getElementById(
            send?.getAttribute("aria-describedby") ?? "",
        );
        expect(reason?.textContent).toContain(
            "Messaging is off for your business.",
        );
        expect(reason?.querySelector('a[href="/settings/modules"]')).not.toBe(
            null,
        );
    });

    it("isn't offered to someone who can't turn messaging on", () => {
        const off: ComposerGate = { kind: "off", canManage: false };
        render({ gates: { EMAIL: off, WHATSAPP: off } });
        expect(button("Send message", host)).toBeUndefined();
        // The other two need no messaging.
        expect(button("Add note", host)).toBeDefined();
        expect(button("Schedule follow-up", host)).toBeDefined();
    });
});

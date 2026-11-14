// @vitest-environment jsdom
/**
 * Report this answer (plan 2026-11-13-001 U10, board 21): the sheet says
 * exactly what is sent, sends the answer's id with one reason and the
 * note, and the link becomes the thank-you line.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ sendAskAiReport: vi.fn() }));
vi.mock("@/lib/ask-ai/panel-actions", () => actions);

import { REPORT_CONSENT, ReportAnswer } from "./report-sheet";

let root: Root;
let host: HTMLDivElement;
const page = () => document.body.textContent;
const button = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

for (const phone of [false, true]) {
    it(`says what is sent and sends it (${phone ? "phone" : "desk"})`, async () => {
        actions.sendAskAiReport.mockResolvedValue({
            ok: true,
            data: { id: "r1" },
        });
        act(() => root.render(<ReportAnswer messageId="m2" phone={phone} />));
        act(() => button("Report this answer")?.click());

        expect(page()).toContain(REPORT_CONSENT);
        expect(REPORT_CONSENT).toBe(
            "Sends this question and answer to Saroh to check. Nothing else from your conversations is shared.",
        );
        const radio = Array.from(
            document.querySelectorAll('[role="radio"]'),
        ).find((r) =>
            r.parentElement?.textContent.includes("Didn't understand"),
        ) as HTMLButtonElement | undefined;
        act(() => radio?.click());
        const note = document.querySelector("textarea");
        if (!note) throw new Error("no note");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                "value",
            )?.set?.call(note, "  Was 46  ");
            note.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => {
            button("Send report")?.click();
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(actions.sendAskAiReport).toHaveBeenCalledWith({
            messageId: "m2",
            reason: "DIDNT_UNDERSTAND",
            note: "Was 46",
        });
        expect(host.textContent).toContain("Thanks. Saroh will look at it.");
        expect(button("Report this answer")).toBeUndefined();
    });
}

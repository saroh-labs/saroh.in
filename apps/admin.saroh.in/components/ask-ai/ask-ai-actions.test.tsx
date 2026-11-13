/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dollarsOf, failedWords, parseSettingValue } from "@/lib/ask-ai-words";

import { AiHaltSwitch, DecideAiRequest, SetAiSetting } from "./ask-ai-actions";

/**
 * Ask AI's console writes (DEC-220, U8): each asks a reason and sends what
 * the operator chose; the API checks the value, the permission and writes
 * the ledger (`ai-ops.db.spec.ts`).
 */

const setting = vi.fn();
const halt = vi.fn();
const decide = vi.fn();
vi.mock("@/lib/ask-ai-actions", () => ({
    setAiSettingAction: (i: unknown) => setting(i) as unknown,
    setAiHaltAction: (i: unknown) => halt(i) as unknown,
    decideAiRequestAction: (i: unknown) => decide(i) as unknown,
    resolveAiReportAction: vi.fn(),
}));

afterEach(() => {
    cleanup();
    setting.mockReset();
    halt.mockReset();
    decide.mockReset();
});

function submit(trigger: string, reason: string, confirm = trigger) {
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
        target: { value: reason },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: confirm }));
}

describe("Ask AI's console writes", () => {
    it("halts with a reason, and offers to lift a halt", async () => {
        halt.mockResolvedValue({ ok: true, data: null });
        render(<AiHaltSwitch halted={false} />);
        submit("Halt Ask AI", "provider outage", "Halt");
        await waitFor(() => expect(halt).toHaveBeenCalled());
        expect(halt).toHaveBeenCalledWith({
            halted: true,
            reason: "provider outage",
            idempotencyKey: expect.any(String) as unknown,
        });
        cleanup();
        render(<AiHaltSwitch halted />);
        expect(
            screen.getByRole("button", { name: "Lift the halt" }),
        ).toBeTruthy();
    });

    it("sends a setting's value as typed, with the reason", async () => {
        setting.mockResolvedValue({ ok: true, data: null });
        render(
            <SetAiSetting settingKey="ai.spendAlarmWarnRatio" current={0.8} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Set" }));
        const dialog = screen.getByRole("dialog");
        const value = within(dialog).getByLabelText("Value");
        expect((value as HTMLInputElement).value).toBe("0.8");
        fireEvent.change(value, { target: { value: "0.9" } });
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "warn later" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Set" }));
        await waitFor(() => expect(setting).toHaveBeenCalled());
        expect(setting).toHaveBeenCalledWith({
            key: "ai.spendAlarmWarnRatio",
            value: "0.9",
            reason: "warn later",
            idempotencyKey: expect.any(String) as unknown,
        });
    });

    it("grants a request, and shows the API's refusal", async () => {
        decide.mockResolvedValue({
            ok: false,
            error: "That request is already decided.",
        });
        render(<DecideAiRequest id="req_1" business="Rye Bakery" />);
        submit("Grant", "launch week");
        await waitFor(() =>
            expect(
                screen.getByText("That request is already decided."),
            ).toBeTruthy(),
        );
        expect(decide).toHaveBeenCalledWith({
            id: "req_1",
            decision: "grant",
            reason: "launch week",
            idempotencyKey: expect.any(String) as unknown,
        });
    });
});

describe("Ask AI's words", () => {
    it("reads a typed value as JSON when it is, else as text", () => {
        expect(parseSettingValue("true")).toBe(true);
        expect(parseSettingValue(" 0.75 ")).toBe(0.75);
        expect(parseSettingValue('{"a":1}')).toEqual({ a: 1 });
        expect(parseSettingValue("claude-haiku-5-5")).toBe("claude-haiku-5-5");
    });

    it("says money in dollars and failures as a share", () => {
        expect(dollarsOf(1_234_567)).toBe("$1.23");
        expect(failedWords({ finished: 0, failed: 0 })).toBe(
            "No questions finished",
        );
        expect(failedWords({ finished: 40, failed: 3 })).toBe(
            "3 of 40 failed (8%)",
        );
    });
});

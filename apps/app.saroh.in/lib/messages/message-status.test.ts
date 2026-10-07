import { describe, expect, it } from "vitest";

import { messageStatusWords } from "./message-status";

describe("messageStatusWords", () => {
    it.each([
        ["QUEUED", "Queued", "outline", true],
        ["SENT", "Sent", "default", true],
        ["DELIVERED", "Delivered", "default", true],
        ["FAILED", "Failed", "destructive", true],
        ["BOUNCED", "Bounced", "destructive", true],
        ["SUPPRESSED", "Not sent: they turned email off", "destructive", false],
        [
            "ALLOWANCE_USED",
            "Not emailed: monthly allowance used",
            "warning",
            false,
        ],
        [
            "NO_ALLOWANCE",
            "Not emailed: plan has no Saroh emails",
            "warning",
            false,
        ],
        [
            "BOOKING_LIMIT",
            "Not emailed: limit for this booking today",
            "warning",
            false,
        ],
        ["STOPPED", "Not sent: Saroh email switched off", "neutral", false],
        ["UNKNOWN", "May have been sent", "info", false],
    ])("%s reads %j", (status, label, variant, sent) => {
        expect(messageStatusWords(status)).toEqual({ label, variant, sent });
    });

    it("never shows a raw code for a status Saroh sends", () => {
        for (const status of [
            "ALLOWANCE_USED",
            "NO_ALLOWANCE",
            "BOOKING_LIMIT",
            "STOPPED",
            "UNKNOWN",
        ]) {
            expect(messageStatusWords(status).label).not.toBe(status);
        }
    });

    it("UNKNOWN has its own variant, not the neutral default", () => {
        expect(messageStatusWords("UNKNOWN").variant).not.toBe("outline");
        expect(messageStatusWords("UNKNOWN").variant).not.toBe("neutral");
    });

    it("a status it doesn't know reads as itself", () => {
        expect(messageStatusWords("SOMETHING_NEW")).toEqual({
            label: "SOMETHING_NEW",
            variant: "outline",
            sent: true,
        });
    });
});

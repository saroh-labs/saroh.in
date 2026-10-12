import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    mutate: vi.fn(),
    orgBase: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch: http.apiFetch,
    mutate: http.mutate,
    orgBase: http.orgBase,
}));

import type { AccountUpdates } from "./account-updates";
import {
    ACCOUNT_UPDATES_CHOICES,
    accountUpdatesEmailLine,
    accountUpdatesRow,
    accountUpdatesSaved,
    isAccountUpdates,
} from "./account-updates";
import {
    readAccountUpdates,
    setAccountUpdates,
} from "./account-updates-service";

const state = (over: Partial<AccountUpdates> = {}): AccountUpdates => ({
    on: true,
    offered: true,
    emailConnected: true,
    ...over,
});

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
    http.apiFetch.mockReset();
    http.mutate.mockReset();
    http.orgBase.mockReset();
    http.orgBase.mockResolvedValue("/organizations/org_1");
});

describe("when the row is drawn", () => {
    it("only while the choice can have an effect", () => {
        expect(accountUpdatesRow(state())).not.toBe(null);
        // Off by the business's own hand: still drawn, to turn back on.
        expect(accountUpdatesRow(state({ on: false }))).not.toBe(null);
        // No account area on the instance, or Messages off for the business.
        expect(accountUpdatesRow(state({ offered: false }))).toBe(null);
        expect(accountUpdatesRow(state({ offered: false, on: false }))).toBe(
            null,
        );
        // Unread, or not this person's to see: never guessed.
        expect(accountUpdatesRow(null)).toBe(null);
        expect(accountUpdatesRow(undefined)).toBe(null);
    });
});

describe("what the row says", () => {
    it("on, with its own email", () => {
        expect(accountUpdatesRow(state())).toEqual({
            status: "On",
            says: "Saroh posts order, booking and invoice updates to your customers' Messages.",
            reach: "Your emails go out as well.",
            nothingSent: false,
        });
    });

    it("on, with no email provider: Messages is the only way", () => {
        expect(accountUpdatesRow(state({ emailConnected: false }))).toEqual({
            status: "On",
            says: "Saroh posts order, booking and invoice updates to your customers' Messages.",
            reach: "No email provider is connected, so this is the only way your customers hear that an order is ready.",
            nothingSent: false,
        });
    });

    it("off, with its own email", () => {
        expect(accountUpdatesRow(state({ on: false }))).toEqual({
            status: "Off",
            says: "Saroh posts no order, booking or invoice updates to your customers' Messages.",
            reach: "Your emails still go out.",
            nothingSent: false,
        });
    });

    it("off, with no email provider: nothing tells the customer, said as a warning", () => {
        expect(
            accountUpdatesRow(state({ on: false, emailConnected: false })),
        ).toEqual({
            status: "Off",
            says: "Saroh posts no order, booking or invoice updates to your customers' Messages.",
            reach: "No email provider is connected, so nothing tells a customer their order is ready. Call or message them yourself.",
            nothingSent: true,
        });
    });
});

describe("what the sheet says", () => {
    it("names what customers will and will not see", () => {
        const [on, off] = ACCOUNT_UPDATES_CHOICES;
        expect(on.label).toBe("Post updates to Messages");
        expect(on.note).toBe(
            "Customers see each step of an order, a booking that was confirmed, moved or cancelled, and an invoice you sent or a reminder about it.",
        );
        expect(off.label).toBe("Don't post updates");
        expect(off.note).toBe(
            "Customers see none of these in Messages. They can still write to you there, and your replies still reach them. So does a note you choose to send when you change or cancel an order.",
        );
    });

    it("says what no email provider means before it is turned off", () => {
        expect(accountUpdatesEmailLine(false)).toBe(
            "No email provider is connected. With updates off, you have no other way to tell a customer their order is ready.",
        );
        expect(accountUpdatesEmailLine(true)).toBe(
            "Your emails go out either way.",
        );
    });

    it("the toast says which way it went", () => {
        expect(accountUpdatesSaved(true)).toBe("Updates to Messages are on.");
        expect(accountUpdatesSaved(false)).toBe("Updates to Messages are off.");
    });
});

describe("reading it", () => {
    it("reads the three facts", async () => {
        http.apiFetch.mockResolvedValue(json(state({ on: false })));
        expect(await readAccountUpdates()).toEqual(state({ on: false }));
        expect(http.apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/customer-notices/account-updates",
        );
    });

    it.each([
        ["a refusal (not this person's)", () => json({}, 403)],
        ["an API without it", () => new Response("", { status: 404 })],
        ["a failure", () => json({}, 500)],
        ["a body that is not the three facts", () => json({ on: "yes" })],
        ["a body that isn't JSON", () => new Response("<html>")],
    ])("%s reads as nothing to draw", async (_what, answer) => {
        http.apiFetch.mockResolvedValue(answer());
        expect(await readAccountUpdates()).toBe(null);
    });

    it("an API that can't be reached, or no business open, reads as nothing", async () => {
        http.apiFetch.mockRejectedValue(new Error("offline"));
        expect(await readAccountUpdates()).toBe(null);
        http.orgBase.mockResolvedValue(null);
        expect(await readAccountUpdates()).toBe(null);
    });

    it("only a whole answer counts", () => {
        expect(isAccountUpdates(state())).toBe(true);
        expect(isAccountUpdates({ on: true, offered: true })).toBe(false);
        expect(isAccountUpdates(null)).toBe(false);
        expect(isAccountUpdates("on")).toBe(false);
    });
});

describe("saving it", () => {
    it("sends the choice as a real boolean", async () => {
        http.mutate.mockResolvedValue({ ok: true, data: state({ on: false }) });
        await setAccountUpdates(false);
        expect(http.mutate).toHaveBeenCalledWith(
            "/customer-notices/account-updates",
            "PATCH",
            { on: false },
            "Couldn't save that. Try again.",
        );
    });
});

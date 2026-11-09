/**
 * Whether a Global workspace shows Saroh's plans (stage 9, DEC-211): only
 * with the switch on and the API's word that it sells this business its
 * plans; India follows the switch alone and never asks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface State {
    plans: string | undefined;
    edition: "INDIA" | "GLOBAL";
}
const state = vi.hoisted((): State => ({ plans: "on", edition: "GLOBAL" }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
    env: {
        get NEXT_PUBLIC_PLANS() {
            return state.plans;
        },
    },
}));
vi.mock("@/lib/edition", async () => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        get PROFILE() {
            return editionProfile(state.edition);
        },
    };
});
vi.mock("@/lib/api/http", () => ({
    apiFetch,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));
vi.mock("react", async (actual) => ({
    ...(await actual<object>()),
    cache: <T>(fn: T) => fn,
}));

import { plansOpen } from "./service";

beforeEach(() => apiFetch.mockReset());

const answer = (body: unknown) => ({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
});

describe("plansOpen", () => {
    it("opens Global's plans only when the API sells them", async () => {
        state.edition = "GLOBAL";
        state.plans = "on";
        apiFetch.mockResolvedValue(answer({ offered: true }));
        await expect(plansOpen()).resolves.toBe(true);
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/billing/offered",
        );
        apiFetch.mockResolvedValue(answer({ offered: false }));
        await expect(plansOpen()).resolves.toBe(false);
    });

    it("never asks with the switch off, or in India", async () => {
        state.edition = "GLOBAL";
        state.plans = undefined;
        await expect(plansOpen()).resolves.toBe(false);
        state.edition = "INDIA";
        state.plans = "on";
        await expect(plansOpen()).resolves.toBe(true);
        expect(apiFetch).not.toHaveBeenCalled();
    });
});

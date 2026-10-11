// @vitest-environment jsdom
/**
 * "Your own domain" on Website › Settings when the plan stops including one
 * (DEC-139): the card says the day the domain stops showing the site, then
 * that it is paused and where visitors are sent, with the way to the plans.
 * A plan without a domain refuses a new one the way every plan refusal
 * does. None of it is drawn while plans aren't shown (DEC-136). Made-up
 * domains only.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanAccessProvider } from "@/components/billing/plan-way";
import type { DomainPlanRead, SiteDomain } from "@/lib/domains/service";
import { pinClock } from "@/lib/format/test-clock";

import { CustomDomain } from "./custom-domain";

pinClock();

const flag = vi.hoisted((): { plans: string | undefined } => ({ plans: "on" }));
const list = vi.fn();
const claim = vi.fn();
vi.mock("@/lib/domains/actions", () => ({
    listSiteDomains: (...args: unknown[]) => list(...args) as unknown,
    claimDomain: (...args: unknown[]) => claim(...args) as unknown,
    verifyDomain: vi.fn(),
    removeDomain: vi.fn(),
}));
vi.mock("@/env", () => ({
    env: {
        get NEXT_PUBLIC_PLANS() {
            return flag.plans;
        },
    },
}));
vi.mock("@/components/shared/business-zone", () => ({
    useBusinessZone: () => "Asia/Kolkata",
}));
const showPlanRefusal = vi.fn();
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: (...args: unknown[]) =>
        showPlanRefusal(...args) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
}));

const HOST = "www.yourshop.in";
const STOPS = "2026-11-15T06:30:00.000Z"; // 15 Nov, noon in Kolkata

function domain(plan?: DomainPlanRead, over: Partial<SiteDomain> = {}) {
    const row: SiteDomain = {
        id: "dom_1",
        hostname: HOST,
        status: "VERIFIED",
        siteId: "site_1",
        verifiedAt: "2026-09-01T09:00:00Z",
        lastCheckedAt: null,
        lastCheckResult: null,
        createdAt: "2026-09-01T09:00:00Z",
        dnsRecord: {
            type: "TXT",
            name: `_saroh.${HOST}`,
            value: "saroh-verify=abc123",
        },
        hosting: {
            state: "LIVE",
            problem: null,
            checkedAt: null,
            dnsRecord: null,
        },
        ...(plan ? { plan } : {}),
        ...over,
    };
    return row;
}

const plan = (state: string): DomainPlanRead => ({
    state,
    stopsAt: state === "included" ? null : STOPS,
    sendsTo: "yourshop.saroh.app",
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    flag.plans = "on";
    list.mockReset();
    claim.mockReset();
    showPlanRefusal.mockReset();
    list.mockResolvedValue([]);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

async function draw(canChangePlan = true) {
    act(() =>
        root.render(
            <PlanAccessProvider canChangePlan={canChangePlan}>
                <CustomDomain siteId="site_1" />
            </PlanAccessProvider>,
        ),
    );
    await settle();
}

const card = () => host.querySelector<HTMLElement>(`[data-domain="${HOST}"]`);
const note = () => card()?.querySelector<HTMLElement>("[data-domain-plan]");
const way = () =>
    note()?.querySelector<HTMLAnchorElement>(
        'a[href="/settings/billing#change-plan"]',
    );
const item = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );

describe("a domain's card, by what the plan means for it (DEC-139)", () => {
    it("on a plan with a domain: Live, and nothing about a plan", async () => {
        list.mockResolvedValue([domain(plan("included"))]);
        await draw();
        expect(card()?.textContent).toContain("Live");
        expect(card()?.textContent).toContain(`Live at ${HOST}`);
        expect(note()).toBeNull();
        expect(card()?.textContent).not.toMatch(/plan/i);
    });

    it("before the plan ends: still Live, with the day it stops and the way to the plans", async () => {
        list.mockResolvedValue([domain(plan("ending"))]);
        await draw();
        expect(card()?.textContent).toContain(`Live at ${HOST}`);
        expect(note()?.getAttribute("data-domain-plan")).toBe("ending");
        expect(note()?.textContent).toContain(
            "Stops showing your site on 15 Nov, 3 days after your plan ends.",
        );
        expect(note()?.textContent).toContain(
            "visitors are sent to yourshop.saroh.app",
        );
        expect(way()?.textContent).toBe("See plans");
    });

    it("in the 3 days after: still Live, and the notice stays up", async () => {
        list.mockResolvedValue([domain(plan("grace"))]);
        await draw();
        expect(card()?.textContent).toContain(`Live at ${HOST}`);
        expect(note()?.textContent).toContain(
            "Stops showing your site on 15 Nov: your plan no longer includes your own domain.",
        );
        expect(way()).not.toBeNull();
    });

    it("paused: says so in words, never Live, and keeps the records", async () => {
        list.mockResolvedValue([domain(plan("paused"))]);
        await draw();
        expect(card()?.textContent).toContain("Paused");
        expect(card()?.textContent).not.toContain("Live at");
        expect(card()?.querySelector(`a[href="https://${HOST}"]`)).toBeNull();
        expect(note()?.textContent).toContain(
            "Paused: visitors are sent to yourshop.saroh.app.",
        );
        expect(note()?.textContent).toContain("It stays connected");
        expect(way()?.textContent).toBe("See plans");
        // Nothing to reconnect: the records are still under the domain.
        expect(card()?.textContent).toContain("DNS records");
        // Removing is still offered, and says what it does now.
        expect(item("Remove", card() ?? host)).toBeDefined();
    });

    it("someone who can't change the plan reads who can, in place of the link", async () => {
        list.mockResolvedValue([domain(plan("paused"))]);
        await draw(false);
        expect(note()?.textContent).toContain(
            "Paused: visitors are sent to yourshop.saroh.app.",
        );
        expect(way() ?? null).toBeNull();
        expect(note()?.querySelector("[data-plan-who]")?.textContent).toBe(
            "The owner can change the plan in Settings › Plan and billing.",
        );
    });

    it("a domain that isn't serving yet says it won't until the plan includes one", async () => {
        list.mockResolvedValue([
            domain(plan("paused"), { status: "PENDING", verifiedAt: null }),
        ]);
        await draw();
        expect(card()?.textContent).toContain("Waiting for DNS");
        expect(note()?.textContent).toContain(
            "this one won't show your site until you're on a plan with one",
        );
    });

    it("an api that sends no plan leaves the card as it always was", async () => {
        list.mockResolvedValue([domain()]);
        await draw();
        expect(card()?.textContent).toContain(`Live at ${HOST}`);
        expect(note()).toBeNull();
    });
});

describe("while plans aren't shown (DEC-136)", () => {
    beforeEach(() => {
        flag.plans = undefined;
    });

    it("draws nothing of the plan in any state: the card is as it was", async () => {
        for (const state of ["ending", "grace", "paused"]) {
            list.mockResolvedValue([domain(plan(state))]);
            await draw();
            expect(note()).toBeNull();
            expect(card()?.textContent).toContain(`Live at ${HOST}`);
            expect(card()?.textContent).not.toMatch(/plan|paused/i);
            expect(
                host.querySelector('a[href^="/settings/billing"]'),
            ).toBeNull();
            act(() => root.unmount());
            root = createRoot(host);
        }
    });
});

describe("adding a domain on a plan without one (DEC-139)", () => {
    const refusal = {
        code: "MODULE_LOCKED" as const,
        title: "Your own domain isn't in your plan.",
        body: "Nothing you've made is lost.",
        cta: "See plans",
        upgradeTo: null,
        limit: null,
        used: null,
    };

    async function add() {
        await press(item("Add domain", host));
        const field =
            document.querySelector<HTMLInputElement>("#add-domain-field");
        if (!field) throw new Error("No field");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(field, "shop.example.com");
            field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await press(
            item(
                "Add domain",
                document.querySelector('[role="dialog"]') ?? document,
            ),
        );
    }

    async function press(button: HTMLElement | null | undefined) {
        if (!button) throw new Error("Nothing to press");
        await act(async () => {
            button.click();
            await Promise.resolve();
        });
        await settle();
    }

    it("is refused as the plan's notice, which takes over from the dialog", async () => {
        claim.mockResolvedValue({
            ok: false,
            error: refusal.title,
            plan: refusal,
        });
        await draw();
        await add();
        expect(claim).toHaveBeenCalledWith("site_1", "shop.example.com");
        expect(showPlanRefusal).toHaveBeenCalledWith(refusal);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        // Nothing was added.
        expect(host.querySelector("[data-domain]")).toBeNull();
    });

    it("with no plan notice to show, is said in the dialog in the api's words", async () => {
        // What the server action returns while plans aren't shown: no `plan`.
        claim.mockResolvedValue({ ok: false, error: refusal.title });
        await draw();
        await add();
        expect(showPlanRefusal).not.toHaveBeenCalled();
        expect(
            document.querySelector('[role="dialog"] [role="alert"]')
                ?.textContent,
        ).toBe("Your own domain isn't in your plan.");
    });
});

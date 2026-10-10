// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { viaWelcome } from "../../accounts.saroh.in/lib/signup-welcome";

import { writeChoices, writeConsent } from "./consent";
import type { TagConfig } from "./ga";
import { resetTags } from "./tags";
import { readWelcome, WELCOME_FRESH_MS, welcomeOrigins } from "./welcome";
import { forwardWelcome, MAX_WAIT_MS, META_HOLD_MS } from "./welcome-forward";

/**
 * The sign-up hand-off (DEC-127): accounts.saroh.in sends a newly verified
 * account through saroh.in's `/welcome`, which counts the sign-up only for
 * a visitor who accepted advertising cookies here, and sends them on. Both
 * halves are held together here: the address accounts builds
 * (`apps/accounts.saroh.in/lib/signup-welcome.ts`) is the one this app reads.
 */
const ACCOUNTS = "https://accounts.saroh.in";
const APP = "https://app.saroh.in";
const WELCOME = "https://www.saroh.in/welcome";
const NOW = 1_760_000_000_000;
const CONFIG: TagConfig = {
    gaId: "G-TEST123",
    adsId: "AW-123456789",
    adsSignupLabel: "signLabel",
    pixelId: "1234567890",
};

const send = (destination: string, welcomeUrl: string | undefined = WELCOME) =>
    viaWelcome({
        welcomeUrl,
        destination,
        base: ACCOUNTS,
        forwardable: [ACCOUNTS, APP],
        now: NOW,
    });
const search = (address: string) => new URL(address).search;

describe("accounts → /welcome → on", () => {
    it("carries a new account's destination through /welcome and out again", () => {
        const onboarding = `${APP}/onboarding?plan=grow&cycle=year`;
        const address = send(onboarding);
        expect(address.startsWith(`${WELCOME}?`)).toBe(true);
        expect(readWelcome(search(address), ACCOUNTS, NOW + 1500)).toEqual({
            next: onboarding,
            id: String(NOW),
        });
    });

    it("carries a path on accounts as accounts' own address", () => {
        expect(readWelcome(search(send("/apps")), ACCOUNTS, NOW).next).toBe(
            `${ACCOUNTS}/apps`,
        );
    });

    it("sends nothing about the person: only where they go and when", () => {
        const address = new URL(send(`${APP}/onboarding`));
        expect(Array.from(address.searchParams.keys())).toEqual(["next", "at"]);
    });

    it("goes straight on while the hand-off is off", () => {
        expect(send(`${APP}/onboarding`, "")).toBe(`${APP}/onboarding`);
        expect(
            viaWelcome({
                welcomeUrl: undefined,
                destination: "/apps",
                base: ACCOUNTS,
                forwardable: [ACCOUNTS, APP],
                now: NOW,
            }),
        ).toBe("/apps");
    });

    it("goes straight to a destination /welcome wouldn't forward to", () => {
        expect(send("https://admin.saroh.in/")).toBe("https://admin.saroh.in/");
        expect(send("http://app.saroh.in/onboarding")).toBe(
            "http://app.saroh.in/onboarding",
        );
    });
});

describe("readWelcome", () => {
    it("forwards only to accounts and the workspace beside it", () => {
        expect(welcomeOrigins(ACCOUNTS)).toEqual([ACCOUNTS, APP]);
        expect(welcomeOrigins("https://accounts.saroh.io")).toEqual([
            "https://accounts.saroh.io",
            "https://app.saroh.io",
        ]);
        expect(welcomeOrigins("https://accounts.saroh.localhost")).toEqual([
            "https://accounts.saroh.localhost",
            "https://app.saroh.localhost",
        ]);
        expect(welcomeOrigins("not an address")).toEqual([]);
    });

    it.each([
        ["someone else's site", "https://evil.example/"],
        ["a merchant's site", "https://shop.saroh.app/"],
        ["a look-alike host", "https://app.saroh.in.evil.example/"],
        [
            "a host that only starts like ours",
            "https://app.saroh.in@evil.example/",
        ],
        ["plain http", "http://app.saroh.in/onboarding"],
        ["a script address", "javascript:alert(1)"],
        ["a path", "/onboarding"],
        ["nothing", ""],
    ])("never forwards to %s: the app launcher instead", (_what, next) => {
        const q = `?${new URLSearchParams({ next, at: String(NOW) }).toString()}`;
        expect(readWelcome(q, ACCOUNTS, NOW).next).toBe(`${ACCOUNTS}/apps`);
    });

    it("counts only a visit accounts sent just now", () => {
        const q = (at: string) =>
            `?${new URLSearchParams({ next: `${APP}/onboarding`, at }).toString()}`;
        expect(readWelcome(q(String(NOW)), ACCOUNTS, NOW).id).toBe(String(NOW));
        expect(
            readWelcome(q(String(NOW)), ACCOUNTS, NOW + WELCOME_FRESH_MS).id,
        ).toBe(String(NOW));
        // A bookmark, the back button a day later, an address typed by hand.
        expect(
            readWelcome(q(String(NOW)), ACCOUNTS, NOW + WELCOME_FRESH_MS + 1)
                .id,
        ).toBeNull();
        expect(
            readWelcome(q(String(NOW + 3_600_000)), ACCOUNTS, NOW).id,
        ).toBeNull();
        expect(readWelcome(q("yesterday"), ACCOUNTS, NOW).id).toBeNull();
        expect(readWelcome(q("1"), ACCOUNTS, NOW).id).toBeNull();
        expect(readWelcome("", ACCOUNTS, NOW).id).toBeNull();
    });
});

describe("forwardWelcome", () => {
    const go = vi.fn();
    const onboarding = `${APP}/onboarding?invite=secret-token`;
    const layer = () =>
        (window.dataLayer ?? []).map((e) =>
            Array.from(e as ArrayLike<unknown>),
        );
    const conversions = () =>
        layer().filter((e) => e[0] === "event" && e[1] === "conversion");
    const pixel = () => (window.fbq?.queue ?? []) as unknown[][];
    const scripts = () =>
        Array.from(document.querySelectorAll("script")).map((s) => s.src);

    /** Opens /welcome as accounts would have sent it, `ago` ms ago. */
    function arrive(ago = 0) {
        const address = new URL(
            viaWelcome({
                welcomeUrl: WELCOME,
                destination: onboarding,
                base: ACCOUNTS,
                forwardable: [ACCOUNTS, APP],
                now: Date.now() - ago,
            }),
        );
        window.history.replaceState(null, "", `/welcome${address.search}`);
    }
    const run = (config: TagConfig = CONFIG) =>
        forwardWelcome({ config, accountsUrl: ACCOUNTS, go });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        go.mockReset();
        resetTags();
        writeConsent(null);
        window.localStorage.clear();
        document.cookie =
            "saroh_team=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("with no answer to the cookie notice: loads nothing, sends nothing, goes on at once", () => {
        arrive();
        run();
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);
        expect(scripts()).toEqual([]);
        expect(window.gtag).toBeUndefined();
        expect(window.fbq).toBeUndefined();
    });

    it("after a refusal, or visit counts only: the same", () => {
        writeChoices({ analytics: "granted", ads: "refused" });
        arrive();
        run();
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);
        expect(scripts()).toEqual([]);
    });

    it("after accepting advertising cookies: counts the sign-up once, then goes on", () => {
        writeChoices({ analytics: "granted", ads: "granted" });
        arrive();
        run();
        expect(conversions()).toEqual([
            [
                "event",
                "conversion",
                {
                    send_to: "AW-123456789/signLabel",
                    transaction_id: String(NOW),
                    event_callback: expect.any(Function) as unknown,
                },
            ],
        ]);
        expect(pixel().at(-1)).toEqual([
            "track",
            "CompleteRegistration",
            {},
            { eventID: String(NOW) },
        ]);
        // Held until Google's tag says it has sent and the Pixel has had its moment.
        expect(go).not.toHaveBeenCalled();
        (
            conversions()[0]?.[2] as { event_callback: () => void }
        ).event_callback();
        expect(go).not.toHaveBeenCalled();
        vi.advanceTimersByTime(META_HOLD_MS);
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);
        vi.advanceTimersByTime(MAX_WAIT_MS);
        expect(go).toHaveBeenCalledTimes(1);
    });

    it("never strands the visitor: a blocked tag still lets them through", () => {
        writeChoices({ analytics: "granted", ads: "granted" });
        arrive();
        run();
        vi.advanceTimersByTime(MAX_WAIT_MS - 1);
        expect(go).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);
    });

    it("cuts the address back before any tag loads, so the destination is never reported", () => {
        writeChoices({ analytics: "granted", ads: "granted" });
        arrive();
        run();
        expect(window.location.pathname + window.location.search).toBe(
            "/welcome",
        );
        expect(JSON.stringify([layer(), pixel(), scripts()])).not.toContain(
            "secret-token",
        );
    });

    it("counts nothing on a reload, a bookmark or a stale visit", () => {
        writeChoices({ analytics: "granted", ads: "granted" });
        arrive();
        run();
        vi.advanceTimersByTime(MAX_WAIT_MS);
        expect(conversions()).toHaveLength(1);

        // Back to the same address (the same stamp): the same sign-up.
        resetTags();
        go.mockReset();
        arrive(MAX_WAIT_MS);
        run();
        expect(conversions()).toHaveLength(0);
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);

        resetTags();
        go.mockReset();
        arrive(WELCOME_FRESH_MS + 1000);
        run();
        expect(scripts()).toEqual([]);
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);
    });

    it("counts nothing for the team or a browser that says don't track", () => {
        writeChoices({ analytics: "granted", ads: "granted" });
        document.cookie = "saroh_team=1; path=/";
        arrive();
        run();
        expect(scripts()).toEqual([]);
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);

        document.cookie =
            "saroh_team=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        go.mockReset();
        vi.stubGlobal("navigator", { globalPrivacyControl: true });
        arrive();
        run();
        expect(scripts()).toEqual([]);
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);
    });

    it("is a plain pass-through where no advertising id is set", () => {
        writeChoices({ analytics: "granted", ads: "granted" });
        arrive();
        run({ gaId: "G-TEST123" });
        expect(scripts()).toEqual([]);
        expect(go).toHaveBeenCalledExactlyOnceWith(onboarding);
    });
});

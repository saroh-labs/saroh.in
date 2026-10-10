// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSENT_KEY, writeConsent } from "@/lib/consent";

/**
 * Session replay on saroh.in (DEC-125, owner 10 Oct) starts only after the
 * visitor accepts the cookie notice, stops when they take that back, and
 * never starts for the team or a browser that asks not to be tracked.
 *
 * The tracker here is the real one from `@saroh/error-tracking/browser`,
 * with the SDK and the recorder replaced by spies: "nothing was loaded" is
 * what is checked, not only "nothing was started".
 */
const spies = vi.hoisted(() => ({
    load: vi.fn(),
    loadRecorder: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    init: vi.fn(),
    pathname: "/",
}));

vi.mock("next/navigation", () => ({
    usePathname: () => spies.pathname,
}));
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: unknown }) => (
        <a href={href}>{children as never}</a>
    ),
}));
vi.mock("next/script", () => ({ default: () => null }));

vi.mock("@/lib/error-tracking-browser", async () => {
    const { createBrowserTracking } =
        await import("@saroh/error-tracking/browser");
    const sdk = {
        init: (...args: unknown[]) => {
            spies.init(...args);
            return {
                captureException: vi.fn(),
                startSessionRecording: spies.start,
                stopSessionRecording: spies.stop,
            };
        },
    };
    spies.load.mockImplementation(() => Promise.resolve({ default: sdk }));
    spies.loadRecorder.mockImplementation(() => Promise.resolve({}));
    return {
        browserTracking: createBrowserTracking({
            key: "phc_test",
            app: "web",
            environment: "production",
            load: spies.load,
            loadRecorder: spies.loadRecorder,
            replay: "on",
        }),
    };
});

import { SiteReplay } from "./site-replay";

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

function setSignal(
    name: "doNotTrack" | "globalPrivacyControl",
    value: unknown,
) {
    Object.defineProperty(window.navigator, name, {
        value,
        configurable: true,
    });
}

const accept = () => writeConsent("granted", "analytics+recording");

beforeEach(() => {
    writeConsent(null);
    document.cookie = "saroh_team=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setSignal("doNotTrack", null);
    setSignal("globalPrivacyControl", undefined);
    spies.pathname = "/";
    for (const spy of [
        spies.load,
        spies.loadRecorder,
        spies.start,
        spies.stop,
        spies.init,
    ])
        spy.mockClear();
});
afterEach(async () => {
    cleanup();
    await settle();
});

const nothingLoaded = () => {
    expect(spies.load).not.toHaveBeenCalled();
    expect(spies.loadRecorder).not.toHaveBeenCalled();
    expect(spies.start).not.toHaveBeenCalled();
};

describe("SiteReplay", () => {
    it("loads nothing before the visitor answers the cookie notice", async () => {
        render(<SiteReplay on />);
        await settle();
        nothingLoaded();
    });

    it("starts the recorder once they accept, about nobody", async () => {
        render(<SiteReplay on />);
        await settle();
        act(accept);
        await settle();
        expect(spies.loadRecorder).toHaveBeenCalledTimes(1);
        expect(spies.start).toHaveBeenCalledTimes(1);
        const config = spies.init.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(config.bootstrap).toBeUndefined();
        expect(config.persistence).toBe("memory");
        expect(config.person_profiles).toBe("never");
        expect(config.capture_pageview).toBe(false);
        expect(config.autocapture).toBe(false);
        expect(config.session_recording).toMatchObject({
            maskAllInputs: true,
            recordHeaders: false,
            recordBody: false,
        });
        expect(config.enable_recording_console_log).toBe(false);
    });

    it("starts on a later page for someone who already accepted", async () => {
        accept();
        render(<SiteReplay on />);
        await settle();
        expect(spies.start).toHaveBeenCalledTimes(1);
    });

    it("stops at once when they refuse after accepting", async () => {
        accept();
        render(<SiteReplay on />);
        await settle();
        act(() => writeConsent("refused", "analytics+recording"));
        await settle();
        expect(spies.stop).toHaveBeenCalledTimes(1);
    });

    it("stops when Cookie choices forgets the answer, and loads nothing new", async () => {
        accept();
        render(<SiteReplay on />);
        await settle();
        act(() => writeConsent(null));
        await settle();
        expect(spies.stop).toHaveBeenCalledTimes(1);
        expect(spies.start).toHaveBeenCalledTimes(1);
    });

    it("never starts after a refusal", async () => {
        writeConsent("refused", "analytics+recording");
        render(<SiteReplay on />);
        await settle();
        nothingLoaded();
    });

    it("an Accept given before the notice said it records is not one for recording", async () => {
        // The older notice: Google Analytics alone.
        window.localStorage.setItem(CONSENT_KEY, "granted");
        render(<SiteReplay on />);
        await settle();
        nothingLoaded();
    });

    it("never starts in a Saroh team browser", async () => {
        document.cookie = "saroh_team=1";
        accept();
        render(<SiteReplay on />);
        await settle();
        nothingLoaded();
    });

    it.each([
        ["Do Not Track", "doNotTrack" as const, "1"],
        ["Global Privacy Control", "globalPrivacyControl" as const, true],
    ])("never starts with %s set", async (_name, signal, value) => {
        setSignal(signal, value);
        accept();
        render(<SiteReplay on />);
        await settle();
        nothingLoaded();
    });

    it("never starts where it is switched off, whatever the answer", async () => {
        accept();
        render(<SiteReplay on={false} />);
        await settle();
        nothingLoaded();
    });

    it("never records a pricing draft preview: a staff check is not a visit", async () => {
        spies.pathname = "/pricing/draft";
        accept();
        render(<SiteReplay on />);
        await settle();
        nothingLoaded();
    });

    it("stops when the page goes away", async () => {
        accept();
        const page = render(<SiteReplay on />);
        await settle();
        page.unmount();
        expect(spies.stop).toHaveBeenCalledTimes(1);
    });
});

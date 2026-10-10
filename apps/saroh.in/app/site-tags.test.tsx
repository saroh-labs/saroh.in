// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ADS_CONSENT_KEY,
    CONSENT_KEY,
    CONSENT_SCOPE_KEY,
    clearAdsCookies,
    clearAnalyticsCookies,
    privacySignal,
    readRecordingConsent,
    writeChoices,
    writeConsent,
} from "@/lib/consent";
import type { TagConfig } from "@/lib/ga";
import { resetTags } from "@/lib/tags";

/**
 * The cookie notice (Privacy: "you can refuse them in the cookie notice,
 * and the site works the same") and the tags behind it (DEC-127): Google
 * Analytics loads only after Accept, the advertising tags only after their
 * own Accept, never before an answer or after Refuse, never for the team or
 * a browser that says don't track, and the answers are remembered.
 *
 * The recorder (DEC-125) waits for the same notice. The tracker here is the
 * real one from `@saroh/error-tracking/browser`, with the SDK and the
 * recorder replaced by spies: "nothing was loaded" is what is checked, not
 * only "nothing was started".
 */
const spies = vi.hoisted(() => ({
    load: vi.fn(),
    loadRecorder: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    /** What the recorder was made with: once per page, so kept across tests. */
    config: undefined as Record<string, unknown> | undefined,
    /** The page's address when the recorder was fetched, and when it began. */
    addressAtLoad: "",
    addressAtStart: "",
}));

vi.mock("@/lib/error-tracking-browser", async () => {
    const { createBrowserTracking } =
        await import("@saroh/error-tracking/browser");
    const sdk = {
        init: (_key: string, config: Record<string, unknown>) => {
            spies.config = config;
            return {
                captureException: vi.fn(),
                startSessionRecording: () => {
                    spies.addressAtStart = window.location.search;
                    spies.start();
                },
                stopSessionRecording: spies.stop,
            };
        },
    };
    return {
        browserTracking: createBrowserTracking({
            key: "phc_test",
            app: "web",
            environment: "production",
            load: () => {
                spies.load();
                return Promise.resolve({ default: sdk } as never);
            },
            loadRecorder: () => {
                spies.addressAtLoad = window.location.search;
                spies.loadRecorder();
                return Promise.resolve({});
            },
            replay: "on",
        }),
    };
});

import { SiteTags } from "./site-tags";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const ID = "G-TEST123";
const ADS = "AW-123456789";
const PIXEL = "1234567890";
const GA_ONLY: TagConfig = { gaId: ID };
const WITH_ADS: TagConfig = { gaId: ID, adsId: ADS, pixelId: PIXEL };
/** Production today: visit counts, and the recorder switched on. */
const RECORDED: TagConfig = { gaId: ID, recording: true };
const RECORDED_ONLY: TagConfig = { recording: true };
const EVERYTHING: TagConfig = { ...WITH_ADS, recording: true };

const scripts = () =>
    Array.from(document.querySelectorAll("script")).map((s) => s.src);
const gtagScript = () =>
    scripts().find((s) => s.startsWith("https://www.googletagmanager.com"));
const pixelScript = () =>
    scripts().find((s) => s.startsWith("https://connect.facebook.net"));
const notice = () => screen.queryByRole("region", { name: "Cookies" });
const press = (name: string) =>
    act(() => {
        fireEvent.click(screen.getByRole("button", { name }));
    });
/** The last consent Google's tag was told. */
const googleConsent = () =>
    (window.dataLayer ?? [])
        .map((e) => Array.from(e as ArrayLike<unknown>))
        .filter((e) => e[0] === "consent")
        .at(-1)?.[2];

/** Lets the recorder's fetch and start, which are promises, finish. */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const nothingRecorded = () => {
    expect(spies.load).not.toHaveBeenCalled();
    expect(spies.loadRecorder).not.toHaveBeenCalled();
    expect(spies.start).not.toHaveBeenCalled();
};
/** "Accept" on a notice that said it records. */
const acceptRecording = () =>
    writeChoices({ analytics: "granted", recording: true });

// Forgets the answers, in storage and in memory, and unloads every tag.
beforeEach(() => {
    pathname.current = "/";
    window.history.replaceState(null, "", "/");
    resetTags();
    writeConsent(null);
    document.cookie =
        "saroh_team=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    for (const spy of [spies.load, spies.loadRecorder, spies.start, spies.stop])
        spy.mockClear();
    spies.addressAtLoad = "";
    spies.addressAtStart = "";
});
afterEach(async () => {
    // Unmounting stops the recorder; let a start still on its way give up.
    cleanup();
    await settle();
    vi.unstubAllGlobals();
});

describe("Google Analytics behind the cookie notice", () => {
    it("loads no script before the visitor answers, and shows the notice", () => {
        render(<SiteTags config={GA_ONLY} />);
        expect(scripts()).toEqual([]);
        expect(window.gtag).toBeUndefined();
        expect(notice()).toBeTruthy();
    });

    it("loads GA after Accept, and the notice goes", () => {
        render(<SiteTags config={GA_ONLY} />);
        press("Accept");
        expect(gtagScript()).toBe(
            `https://www.googletagmanager.com/gtag/js?id=${ID}`,
        );
        expect(notice()).toBeNull();
    });

    it("loads none after Refuse, and the notice goes", () => {
        render(<SiteTags config={GA_ONLY} />);
        press("Refuse");
        expect(scripts()).toEqual([]);
        expect(notice()).toBeNull();
    });

    it("remembers the answer on the next page", () => {
        const first = render(<SiteTags config={GA_ONLY} />);
        press("Accept");
        expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
        first.unmount();
        resetTags();
        render(<SiteTags config={GA_ONLY} />);
        expect(notice()).toBeNull();
        expect(gtagScript()).toBeTruthy();
    });

    it("remembers a refusal on the next page", () => {
        window.localStorage.setItem(CONSENT_KEY, "refused");
        render(<SiteTags config={GA_ONLY} />);
        expect(notice()).toBeNull();
        expect(scripts()).toEqual([]);
    });

    it("still works when the browser blocks storage", () => {
        const get = vi
            .spyOn(Storage.prototype, "getItem")
            .mockImplementation(() => {
                throw new Error("blocked");
            });
        const set = vi
            .spyOn(Storage.prototype, "setItem")
            .mockImplementation(() => {
                throw new Error("blocked");
            });
        render(<SiteTags config={GA_ONLY} />);
        expect(notice()).toBeTruthy();
        press("Refuse");
        expect(notice()).toBeNull();
        expect(scripts()).toEqual([]);
        get.mockRestore();
        set.mockRestore();
    });

    it("draws nothing without an id: previews, local and tests have no tag and no notice", () => {
        render(<SiteTags config={{}} />);
        expect(notice()).toBeNull();
        expect(scripts()).toEqual([]);
    });

    it("links Privacy only once the page is published", () => {
        const { unmount } = render(<SiteTags config={GA_ONLY} />);
        expect(screen.queryByRole("link", { name: "Privacy" })).toBeNull();
        unmount();
        render(<SiteTags config={GA_ONLY} privacyHref="/privacy" />);
        expect(
            screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
        ).toBe("/privacy");
    });

    it("is a corner notice, not a modal: nothing behind it is blocked", () => {
        render(<SiteTags config={GA_ONLY} />);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(document.body);
    });

    it("asks only about visit counts when saroh.in doesn't advertise", () => {
        render(<SiteTags config={GA_ONLY} />);
        expect(notice()?.textContent).toContain(
            "saroh.in uses Google Analytics cookies to count visits. Refuse them and the site works the same.",
        );
        expect(notice()?.textContent).not.toMatch(/ads|Meta/i);
        expect(screen.getAllByRole("button")).toHaveLength(2);
    });

    it("takes the answer back from Cookie choices, and stops the tag", () => {
        render(<SiteTags config={GA_ONLY} />);
        press("Accept");
        act(() => writeConsent(null));
        expect(notice()).toBeTruthy();
        expect(googleConsent()).toMatchObject({ analytics_storage: "denied" });
        expect(
            (window as unknown as Record<string, unknown>)[`ga-disable-${ID}`],
        ).toBe(true);
    });
});

describe("advertising tags behind the cookie notice", () => {
    it("says what the advertising cookies do and who is told, and loads nothing until answered", () => {
        render(<SiteTags config={WITH_ADS} />);
        expect(notice()?.textContent).toContain(
            "saroh.in uses Google Analytics cookies to count visits, and Google Ads and Meta cookies to see which of our ads work and to show Saroh's ads to people who've visited. They tell Google and Meta you were here. Refuse them and the site works the same.",
        );
        expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
            ["Accept all", "Visit counts only", "Refuse"],
        );
        expect(scripts()).toEqual([]);
        expect(window.fbq).toBeUndefined();
    });

    it("names only the platform that is set", () => {
        render(<SiteTags config={{ gaId: ID, pixelId: PIXEL }} />);
        expect(notice()?.textContent).toContain("and Meta cookies");
        expect(notice()?.textContent).toContain("They tell Meta you were here");
        expect(notice()?.textContent).not.toContain("Google Ads");
    });

    it("Accept all loads Analytics, Google Ads and the Pixel", () => {
        render(<SiteTags config={WITH_ADS} />);
        press("Accept all");
        expect(gtagScript()).toBeTruthy();
        expect(pixelScript()).toBeTruthy();
        expect(googleConsent()).toEqual({
            ad_storage: "granted",
            ad_user_data: "granted",
            ad_personalization: "granted",
            analytics_storage: "granted",
        });
        expect(notice()).toBeNull();
    });

    it("Visit counts only loads Analytics and no advertising tag", () => {
        render(<SiteTags config={WITH_ADS} />);
        press("Visit counts only");
        expect(gtagScript()).toBe(
            `https://www.googletagmanager.com/gtag/js?id=${ID}`,
        );
        expect(pixelScript()).toBeUndefined();
        expect(window.fbq).toBeUndefined();
        expect(googleConsent()).toEqual({
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
            analytics_storage: "granted",
        });
        expect(window.localStorage.getItem(ADS_CONSENT_KEY)).toBe("refused");
        expect(notice()).toBeNull();
    });

    it("Refuse loads nothing at all", () => {
        render(<SiteTags config={WITH_ADS} />);
        press("Refuse");
        expect(scripts()).toEqual([]);
        expect(window.gtag).toBeUndefined();
        expect(window.fbq).toBeUndefined();
        expect(notice()).toBeNull();
    });

    it("asks someone who accepted visit counts earlier about advertising, and loads no ad tag meanwhile", () => {
        window.localStorage.setItem(CONSENT_KEY, "granted");
        render(<SiteTags config={WITH_ADS} />);
        expect(notice()?.textContent).toContain(
            "saroh.in now advertises. May we use Google Ads and Meta cookies",
        );
        expect(gtagScript()).toBeTruthy();
        expect(pixelScript()).toBeUndefined();
        expect(googleConsent()).toMatchObject({ ad_storage: "denied" });

        press("Refuse");
        expect(notice()).toBeNull();
        expect(pixelScript()).toBeUndefined();
        expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
    });

    it("doesn't ask someone who refused cookies again", () => {
        window.localStorage.setItem(CONSENT_KEY, "refused");
        render(<SiteTags config={WITH_ADS} />);
        expect(notice()).toBeNull();
        expect(scripts()).toEqual([]);
    });

    it("stops both when the answer is taken back, and asks again", () => {
        render(<SiteTags config={WITH_ADS} />);
        press("Accept all");
        act(() => writeConsent(null));
        expect(notice()).toBeTruthy();
        expect(googleConsent()).toEqual({
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
            analytics_storage: "denied",
        });
        expect((window.fbq?.queue ?? []).at(-1)).toEqual(["consent", "revoke"]);
        expect(window.localStorage.getItem(ADS_CONSENT_KEY)).toBeNull();
    });
});

/**
 * Recording how the site is used (DEC-125, owner 10 Oct) is part of the
 * first answer, with visit counts: one "Accept" covers both, in words that
 * say so, and the recorder starts on nothing less.
 */
describe("the notice where the site is recorded", () => {
    it("says that accepting records how the site is used, and that typing never is", () => {
        render(<SiteTags config={RECORDED} />);
        expect(notice()?.textContent).toContain(
            "saroh.in uses Google Analytics cookies to count visits and, if you accept, records how the site is used so we can make it clearer. What you type is never recorded. Refuse and the site works the same.",
        );
        expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
            ["Accept", "Refuse"],
        );
    });

    it("says nothing of recording where it is off: the words are as they were", () => {
        render(<SiteTags config={GA_ONLY} />);
        expect(notice()?.textContent).not.toContain("record");
    });

    it("keeps what the answer was an answer to", () => {
        render(<SiteTags config={RECORDED} />);
        press("Accept");
        expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBe(
            "analytics+recording",
        );
        expect(gtagScript()).toBeTruthy();
        expect(notice()).toBeNull();
    });

    it("an Accept where recording is off is for visit counts alone", () => {
        render(<SiteTags config={GA_ONLY} />);
        press("Accept");
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBe(
            "analytics",
        );
        expect(readRecordingConsent()).toBeNull();
    });

    it("still asks with no Analytics id, about recording alone, and loads no Google tag", async () => {
        render(<SiteTags config={RECORDED_ONLY} />);
        const text = notice()?.textContent ?? "";
        expect(text).toContain(
            "If you accept, saroh.in records how the site is used so we can make it clearer. What you type is never recorded.",
        );
        expect(text).not.toContain("Google Analytics");
        press("Accept");
        await settle();
        expect(notice()).toBeNull();
        expect(scripts()).toEqual([]);
        expect(spies.start).toHaveBeenCalledTimes(1);
    });

    it("leaves an older refusal alone: nobody is asked twice to say no", async () => {
        window.localStorage.setItem(CONSENT_KEY, "refused");
        render(<SiteTags config={EVERYTHING} />);
        await settle();
        expect(notice()).toBeNull();
        expect(scripts()).toEqual([]);
        nothingRecorded();
    });

    it("forgets the scope with the answer", () => {
        acceptRecording();
        writeConsent(null);
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBeNull();
        expect(readRecordingConsent()).toBeNull();
    });

    it("reads the recording answer from the first answer and what it covered", () => {
        expect(readRecordingConsent()).toBeNull();
        // An accept from before 10 Oct has no scope at all.
        window.localStorage.setItem(CONSENT_KEY, "granted");
        expect(readRecordingConsent()).toBeNull();
        writeConsent("granted", "analytics");
        expect(readRecordingConsent()).toBeNull();
        writeConsent("granted", "analytics+recording");
        expect(readRecordingConsent()).toBe("granted");
        writeConsent("granted", "analytics-only");
        expect(readRecordingConsent()).toBe("refused");
        // A refusal covers everything, whatever it was a refusal of.
        writeConsent("refused", "analytics+recording");
        expect(readRecordingConsent()).toBe("refused");
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBeNull();
    });
});

/**
 * An "Accept" from before the notice said it records was for visit counts.
 * It is never stretched: Google Analytics carries on as agreed, nothing is
 * recorded, and the notice asks once about recording.
 */
describe("someone who accepted before the notice said it records", () => {
    beforeEach(() => window.localStorage.setItem(CONSENT_KEY, "granted"));

    it("keeps visit counts, is not recorded, and is asked about recording", async () => {
        render(<SiteTags config={RECORDED} />);
        await settle();
        expect(notice()?.textContent).toContain(
            "You accepted Google Analytics cookies that count visits. May saroh.in also record how the site is used, so we can make it clearer? What you type is never recorded. Refuse and the site works the same.",
        );
        expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
            ["Accept", "Refuse"],
        );
        expect(gtagScript()).toBeTruthy();
        expect(googleConsent()).toMatchObject({ analytics_storage: "granted" });
        nothingRecorded();
    });

    it("an accept given where recording was off is asked the same way", async () => {
        writeConsent("granted", "analytics");
        render(<SiteTags config={RECORDED} />);
        await settle();
        expect(notice()?.textContent).toContain("May saroh.in also record");
        nothingRecorded();
    });

    it("Accept starts the recorder, and the notice goes", async () => {
        render(<SiteTags config={RECORDED} />);
        press("Accept");
        await settle();
        expect(notice()).toBeNull();
        expect(spies.start).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBe(
            "analytics+recording",
        );
    });

    it("Refuse keeps visit counts as they agreed, records nothing, and is not asked again", async () => {
        const first = render(<SiteTags config={RECORDED} />);
        press("Refuse");
        await settle();
        expect(notice()).toBeNull();
        nothingRecorded();
        expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBe(
            "analytics-only",
        );
        expect(googleConsent()).toMatchObject({ analytics_storage: "granted" });

        first.unmount();
        resetTags();
        render(<SiteTags config={RECORDED} />);
        await settle();
        expect(notice()).toBeNull();
        expect(gtagScript()).toBeTruthy();
        nothingRecorded();
    });

    it("is asked about recording and advertising in one notice where both are new", async () => {
        render(<SiteTags config={EVERYTHING} />);
        expect(notice()?.textContent).toContain(
            "You accepted Google Analytics cookies that count visits. May saroh.in also record how the site is used, so we can make it clearer? What you type is never recorded. It now advertises too, and would use Google Ads and Meta cookies to see which of our ads work and to show Saroh's ads to people who've visited; they tell Google and Meta you were here. Refuse and the site works the same.",
        );
        expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
            ["Accept all", "Recording only", "Refuse"],
        );
        press("Recording only");
        await settle();
        expect(notice()).toBeNull();
        expect(spies.start).toHaveBeenCalledTimes(1);
        expect(pixelScript()).toBeUndefined();
        expect(window.localStorage.getItem(ADS_CONSENT_KEY)).toBe("refused");
        expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
    });

    it("refusing both leaves visit counts and nothing else", async () => {
        render(<SiteTags config={EVERYTHING} />);
        press("Refuse");
        await settle();
        expect(notice()).toBeNull();
        nothingRecorded();
        expect(pixelScript()).toBeUndefined();
        expect(googleConsent()).toEqual({
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
            analytics_storage: "granted",
        });
    });
});

/** Visit counts, recording and advertising, all switched on: one notice. */
describe("one notice for visit counts, recording and advertising", () => {
    it("says all of it, and offers the first answer alone", () => {
        render(<SiteTags config={EVERYTHING} />);
        expect(notice()?.textContent).toContain(
            "saroh.in uses Google Analytics cookies to count visits and, if you accept, records how the site is used so we can make it clearer; what you type is never recorded. It also uses Google Ads and Meta cookies to see which of our ads work and to show Saroh's ads to people who've visited; they tell Google and Meta you were here. Refuse and the site works the same.",
        );
        expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
            ["Accept all", "Counts and recording only", "Refuse"],
        );
        expect(scripts()).toEqual([]);
        nothingRecorded();
    });

    it("names only the ad platform that is set", () => {
        render(<SiteTags config={{ ...RECORDED, adsId: ADS }} />);
        const text = notice()?.textContent ?? "";
        expect(text).toContain("It also uses Google Ads cookies");
        expect(text).toContain("they tell Google you were here");
        expect(text).not.toContain("Meta");
    });

    it("Accept all loads the tags and starts the recorder", async () => {
        render(<SiteTags config={EVERYTHING} />);
        press("Accept all");
        await settle();
        expect(gtagScript()).toBeTruthy();
        expect(pixelScript()).toBeTruthy();
        expect(spies.start).toHaveBeenCalledTimes(1);
        expect(notice()).toBeNull();
    });

    it("Counts and recording only loads Analytics and the recorder, and no advertising tag", async () => {
        render(<SiteTags config={EVERYTHING} />);
        press("Counts and recording only");
        await settle();
        expect(gtagScript()).toBe(
            `https://www.googletagmanager.com/gtag/js?id=${ID}`,
        );
        expect(spies.start).toHaveBeenCalledTimes(1);
        expect(pixelScript()).toBeUndefined();
        expect(window.fbq).toBeUndefined();
        expect(googleConsent()).toMatchObject({
            ad_storage: "denied",
            analytics_storage: "granted",
        });
        expect(window.localStorage.getItem(ADS_CONSENT_KEY)).toBe("refused");
    });

    it("Refuse loads nothing and records nothing", async () => {
        render(<SiteTags config={EVERYTHING} />);
        press("Refuse");
        await settle();
        expect(scripts()).toEqual([]);
        nothingRecorded();
        expect(notice()).toBeNull();
    });

    it("offers recording alone where there is no Analytics id", () => {
        render(<SiteTags config={{ recording: true, pixelId: PIXEL }} />);
        expect(notice()?.textContent).toContain(
            "If you accept, saroh.in records how the site is used so we can make it clearer; what you type is never recorded. It also uses Meta cookies",
        );
        expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
            ["Accept all", "Recording only", "Refuse"],
        );
    });

    it("asks someone who answered before saroh.in advertised about advertising alone, and goes on recording", async () => {
        acceptRecording();
        render(<SiteTags config={EVERYTHING} />);
        await settle();
        expect(notice()?.textContent).toContain(
            "saroh.in now advertises. May we use Google Ads and Meta cookies",
        );
        expect(spies.start).toHaveBeenCalledTimes(1);
        expect(pixelScript()).toBeUndefined();
    });
});

/**
 * The recorder itself: it starts only after an accept that covered it,
 * stops when that is taken back, and never starts for the team, a browser
 * that asks not to be tracked, or a page that is never recorded.
 */
describe("the recorder behind the cookie notice", () => {
    it("loads nothing before the visitor answers", async () => {
        render(<SiteTags config={RECORDED} />);
        await settle();
        nothingRecorded();
    });

    it("starts once they accept, about nobody", async () => {
        render(<SiteTags config={RECORDED} />);
        await settle();
        press("Accept");
        await settle();
        expect(spies.loadRecorder).toHaveBeenCalledTimes(1);
        expect(spies.start).toHaveBeenCalledTimes(1);
        const config = spies.config ?? {};
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
        acceptRecording();
        render(<SiteTags config={RECORDED} />);
        await settle();
        expect(spies.start).toHaveBeenCalledTimes(1);
    });

    it("cuts the address back before the recorder is fetched or begins", async () => {
        window.history.replaceState(
            null,
            "",
            "/waitlist?ref=someone&invite=abc&email=a%40example.com&token=t0k3n&plan=growth",
        );
        acceptRecording();
        render(<SiteTags config={RECORDED_ONLY} />);
        await settle();
        expect(spies.start).toHaveBeenCalledTimes(1);
        expect(spies.addressAtLoad).toBe("?plan=growth");
        expect(spies.addressAtStart).toBe("?plan=growth");
    });

    it("cuts every later address too, as it is set", async () => {
        acceptRecording();
        render(<SiteTags config={RECORDED_ONLY} />);
        await settle();
        window.history.pushState(null, "", "/waitlist?ref=someone&src=home");
        expect(window.location.search).toBe("?src=home");
    });

    it("stops at once when they refuse after accepting", async () => {
        acceptRecording();
        render(<SiteTags config={RECORDED} />);
        await settle();
        act(() => writeChoices({ analytics: "refused" }));
        await settle();
        expect(spies.stop).toHaveBeenCalledTimes(1);
    });

    it("stops when Cookie choices forgets the answer, and loads nothing new", async () => {
        acceptRecording();
        render(<SiteTags config={RECORDED} />);
        await settle();
        act(() => writeConsent(null));
        await settle();
        expect(spies.stop).toHaveBeenCalledTimes(1);
        expect(spies.start).toHaveBeenCalledTimes(1);
        expect(notice()).toBeTruthy();
    });

    it("never starts after a refusal", async () => {
        writeChoices({ analytics: "refused" });
        render(<SiteTags config={RECORDED} />);
        await settle();
        nothingRecorded();
    });

    it("an Accept given before the notice said it records is not one for recording", async () => {
        // The older notice: Google Analytics alone.
        window.localStorage.setItem(CONSENT_KEY, "granted");
        render(<SiteTags config={RECORDED} />);
        await settle();
        nothingRecorded();
    });

    it("never starts in a Saroh team browser", async () => {
        document.cookie = "saroh_team=1; path=/";
        acceptRecording();
        render(<SiteTags config={RECORDED} />);
        await settle();
        nothingRecorded();
        expect(notice()).toBeNull();
    });

    it.each([
        ["Do Not Track", { doNotTrack: "1" }],
        ["Global Privacy Control", { globalPrivacyControl: true }],
    ])("never starts with %s set", async (_name, signal) => {
        vi.stubGlobal("navigator", signal);
        acceptRecording();
        render(<SiteTags config={RECORDED} />);
        await settle();
        nothingRecorded();
        expect(notice()).toBeNull();
    });

    it("never starts where it is switched off, whatever the answer", async () => {
        acceptRecording();
        render(<SiteTags config={GA_ONLY} />);
        await settle();
        nothingRecorded();
    });

    it("never records a pricing draft preview: a staff check is not a visit", async () => {
        pathname.current = "/pricing/draft";
        acceptRecording();
        render(<SiteTags config={RECORDED} />);
        await settle();
        nothingRecorded();
    });

    it("never records the sign-up hand-off", async () => {
        pathname.current = "/welcome";
        acceptRecording();
        render(<SiteTags config={EVERYTHING} />);
        await settle();
        nothingRecorded();
    });

    it("stops when the page moves to one that is never recorded", async () => {
        acceptRecording();
        const page = render(<SiteTags config={RECORDED} />);
        await settle();
        pathname.current = "/pricing/draft";
        page.rerender(<SiteTags config={RECORDED} />);
        await settle();
        expect(spies.stop).toHaveBeenCalledTimes(1);
    });

    it("stops when the page goes away", async () => {
        acceptRecording();
        const page = render(<SiteTags config={RECORDED} />);
        await settle();
        page.unmount();
        expect(spies.stop).toHaveBeenCalledTimes(1);
    });
});

describe("browsers that are never tagged", () => {
    const accepted = () => {
        window.localStorage.setItem(CONSENT_KEY, "granted");
        window.localStorage.setItem(ADS_CONSENT_KEY, "granted");
    };

    it("the team's: no tag and no notice, even after accepting", () => {
        accepted();
        document.cookie = "saroh_team=1; path=/";
        render(<SiteTags config={WITH_ADS} />);
        expect(scripts()).toEqual([]);
        expect(notice()).toBeNull();
    });

    it("one sending Global Privacy Control: no tag and no notice", () => {
        accepted();
        vi.stubGlobal("navigator", { globalPrivacyControl: true });
        render(<SiteTags config={WITH_ADS} />);
        expect(scripts()).toEqual([]);
        expect(notice()).toBeNull();
    });

    it("one sending Do Not Track: no tag and no notice", () => {
        vi.stubGlobal("navigator", { doNotTrack: "1" });
        render(<SiteTags config={WITH_ADS} />);
        expect(scripts()).toEqual([]);
        expect(notice()).toBeNull();
    });

    it("a pricing draft preview: no tag and no notice", () => {
        accepted();
        pathname.current = "/pricing/draft";
        render(<SiteTags config={WITH_ADS} />);
        expect(scripts()).toEqual([]);
        expect(notice()).toBeNull();
    });

    it("the sign-up hand-off shows no notice and leaves its tags to the page", () => {
        pathname.current = "/welcome";
        render(<SiteTags config={WITH_ADS} />);
        expect(notice()).toBeNull();
        expect(scripts()).toEqual([]);
    });
});

describe("privacySignal", () => {
    it("is Global Privacy Control or Do Not Track, and nothing else", () => {
        expect(privacySignal({ globalPrivacyControl: true })).toBe(true);
        expect(privacySignal({ doNotTrack: "1" })).toBe(true);
        expect(privacySignal({ doNotTrack: "yes" })).toBe(true);
        expect(privacySignal({}, { doNotTrack: "1" })).toBe(true);
        expect(privacySignal({ doNotTrack: "0" })).toBe(false);
        expect(privacySignal({ doNotTrack: null })).toBe(false);
        expect(privacySignal({ globalPrivacyControl: false })).toBe(false);
        expect(privacySignal({})).toBe(false);
    });
});

describe("clearing cookies", () => {
    const fake = (cookie: string) => {
        const written: string[] = [];
        const doc = {
            get cookie() {
                return cookie;
            },
            set cookie(value: string) {
                written.push(value);
            },
        } as unknown as Document;
        return { doc, written };
    };

    it("expires GA's cookies on the host and its parent domains, and only those", () => {
        const { doc, written } = fake("_ga=GA1.1; _ga_ABC=GS1; session=keep");
        clearAnalyticsCookies(doc, "www.saroh.in");
        expect(written.every((c) => /^_ga(_ABC)?=;/.test(c))).toBe(true);
        expect(written).toContain(
            "_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.saroh.in",
        );
        expect(written.some((c) => c.startsWith("session"))).toBe(false);
    });

    it("expires Google Ads' and the Pixel's cookies, and leaves GA's and the site's", () => {
        const { doc, written } = fake(
            "_gcl_au=1; _gcl_aw=2; _gac_UA=3; _fbp=4; _fbc=5; _ga=keep; saroh_team=1; _fbpx=keep",
        );
        clearAdsCookies(doc, "www.saroh.in");
        const names = Array.from(new Set(written.map((c) => c.split("=")[0])));
        expect(names).toEqual([
            "_gcl_au",
            "_gcl_aw",
            "_gac_UA",
            "_fbp",
            "_fbc",
        ]);
        expect(written).toContain(
            "_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.saroh.in",
        );
    });
});

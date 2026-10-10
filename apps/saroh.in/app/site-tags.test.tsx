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
    clearAdsCookies,
    clearAnalyticsCookies,
    privacySignal,
    writeConsent,
} from "@/lib/consent";
import type { TagConfig } from "@/lib/ga";
import { resetTags } from "@/lib/tags";

import { SiteTags } from "./site-tags";

/**
 * The cookie notice (Privacy: "you can refuse them in the cookie notice,
 * and the site works the same") and the tags behind it (DEC-127): Google
 * Analytics loads only after Accept, the advertising tags only after their
 * own Accept, never before an answer or after Refuse, never for the team or
 * a browser that says don't track, and the answers are remembered.
 */
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

// Forgets the answers, in storage and in memory, and unloads every tag.
beforeEach(() => {
    pathname.current = "/";
    resetTags();
    writeConsent(null);
    document.cookie =
        "saroh_team=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});
afterEach(() => {
    cleanup();
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

// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    CONSENT_KEY,
    CONSENT_SCOPE_KEY,
    clearAnalyticsCookies,
    consentFor,
    writeConsent,
} from "@/lib/consent";

import { GoogleAnalytics, noticeWords } from "./google-analytics";

/**
 * The cookie notice (Privacy: "you can refuse them in the cookie notice,
 * and the site works the same"): GA loads only after Accept, never before
 * an answer or after Refuse, and the answer is remembered.
 */
vi.mock("next/script", () => ({
    default: ({
        src,
        id,
        children,
    }: {
        src?: string;
        id?: string;
        children?: ReactNode;
    }) => (
        <script data-testid="ga" data-src={src} id={id}>
            {children}
        </script>
    ),
}));
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
const gaTags = () => document.querySelectorAll('[data-testid="ga"]');
const gtagScript = () =>
    document.querySelector('[data-src^="https://www.googletagmanager.com"]');
const notice = () => screen.queryByRole("region", { name: "Cookies" });

// Forgets the answer, in storage and in memory, before each test.
beforeEach(() => writeConsent(null));
afterEach(cleanup);

describe("GoogleAnalytics with the cookie notice", () => {
    it("loads no GA script before the visitor answers, and shows the notice", () => {
        render(<GoogleAnalytics id={ID} />);
        expect(gaTags()).toHaveLength(0);
        expect(notice()).toBeTruthy();
    });

    it("loads GA after Accept, and the notice goes", () => {
        render(<GoogleAnalytics id={ID} />);
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Accept" }));
        });
        expect(gtagScript()?.getAttribute("data-src")).toBe(
            `https://www.googletagmanager.com/gtag/js?id=${ID}`,
        );
        expect(notice()).toBeNull();
    });

    it("loads none after Refuse, and the notice goes", () => {
        render(<GoogleAnalytics id={ID} />);
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Refuse" }));
        });
        expect(gaTags()).toHaveLength(0);
        expect(notice()).toBeNull();
    });

    it("remembers the answer on the next page", () => {
        const first = render(<GoogleAnalytics id={ID} />);
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Accept" }));
        });
        expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
        first.unmount();
        render(<GoogleAnalytics id={ID} />);
        expect(notice()).toBeNull();
        expect(gtagScript()).toBeTruthy();
    });

    it("remembers a refusal on the next page", () => {
        window.localStorage.setItem(CONSENT_KEY, "refused");
        render(<GoogleAnalytics id={ID} />);
        expect(notice()).toBeNull();
        expect(gaTags()).toHaveLength(0);
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
        render(<GoogleAnalytics id={ID} />);
        expect(notice()).toBeTruthy();
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Refuse" }));
        });
        expect(notice()).toBeNull();
        expect(gaTags()).toHaveLength(0);
        get.mockRestore();
        set.mockRestore();
    });

    it("draws nothing without an id: previews, local and tests have no GA and no notice", () => {
        render(<GoogleAnalytics id={undefined} />);
        expect(notice()).toBeNull();
        expect(gaTags()).toHaveLength(0);
    });

    it("links Privacy only once the page is published", () => {
        const { unmount } = render(<GoogleAnalytics id={ID} />);
        expect(screen.queryByRole("link", { name: "Privacy" })).toBeNull();
        unmount();
        render(<GoogleAnalytics id={ID} privacyHref="/privacy" />);
        expect(
            screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
        ).toBe("/privacy");
    });

    it("is a corner notice, not a modal: nothing behind it is blocked", () => {
        render(<GoogleAnalytics id={ID} />);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(document.body);
    });
});

/**
 * Where session replay is switched on (DEC-125, 10 Oct), the one notice
 * asks about it too, in words that say so, and an older "Accept" (for
 * Google Analytics alone) is asked again rather than stretched to cover it.
 */
describe("the cookie notice where the site is recorded", () => {
    it("says that accepting records how the site is used", () => {
        render(<GoogleAnalytics id={ID} recording />);
        const text = notice()?.textContent ?? "";
        expect(text).toContain("Google Analytics cookies");
        expect(text).toContain("records how the site is used");
        expect(text).toContain("What you type is never recorded");
    });

    it("says nothing of recording where it is off: the words are as they were", () => {
        render(<GoogleAnalytics id={ID} />);
        expect(notice()?.textContent).toContain(
            "saroh.in uses Google Analytics cookies to count visits. Refuse them and the site works the same.",
        );
        expect(notice()?.textContent).not.toContain("record");
    });

    it("keeps what the answer was an answer to", () => {
        render(<GoogleAnalytics id={ID} recording />);
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Accept" }));
        });
        expect(window.localStorage.getItem(CONSENT_KEY)).toBe("granted");
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBe(
            "analytics+recording",
        );
        expect(gtagScript()).toBeTruthy();
    });

    it("asks again after an older Accept, and loads nothing until answered", () => {
        window.localStorage.setItem(CONSENT_KEY, "granted");
        render(<GoogleAnalytics id={ID} recording />);
        expect(notice()).toBeTruthy();
        expect(gaTags()).toHaveLength(0);
    });

    it("leaves an older refusal alone: nobody is asked twice to say no", () => {
        window.localStorage.setItem(CONSENT_KEY, "refused");
        render(<GoogleAnalytics id={ID} recording />);
        expect(notice()).toBeNull();
        expect(gaTags()).toHaveLength(0);
    });

    it("still asks with no Analytics id, about recording alone, and loads no GA", () => {
        render(<GoogleAnalytics id={undefined} recording />);
        const text = notice()?.textContent ?? "";
        expect(text).toContain("records how the site is used");
        expect(text).not.toContain("Google Analytics");
        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Accept" }));
        });
        expect(notice()).toBeNull();
        expect(gaTags()).toHaveLength(0);
    });

    it("forgets the scope with the answer", () => {
        writeConsent("granted", "analytics+recording");
        writeConsent(null);
        expect(window.localStorage.getItem(CONSENT_SCOPE_KEY)).toBeNull();
    });

    it("reads an answer by what this deployment would switch on", () => {
        expect(consentFor("granted", false, true)).toBeNull();
        expect(consentFor("granted", true, true)).toBe("granted");
        expect(consentFor("granted", false, false)).toBe("granted");
        expect(consentFor("refused", false, true)).toBe("refused");
        expect(consentFor(null, false, true)).toBeNull();
        expect(
            noticeWords({ analytics: true, recording: false }),
        ).not.toContain("record");
    });
});

describe("clearAnalyticsCookies", () => {
    it("expires GA's cookies on the host and its parent domains, and only those", () => {
        const written: string[] = [];
        const doc = {
            get cookie() {
                return "_ga=GA1.1; _ga_ABC=GS1; session=keep";
            },
            set cookie(value: string) {
                written.push(value);
            },
        } as unknown as Document;
        clearAnalyticsCookies(doc, "www.saroh.in");
        expect(written.every((c) => /^_ga(_ABC)?=;/.test(c))).toBe(true);
        expect(written).toContain(
            "_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.saroh.in",
        );
        expect(written.some((c) => c.startsWith("session"))).toBe(false);
    });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LOOK_IDS } from "@saroh/block-contract";

import {
    ConsentBanner,
    CookieChoicesButton,
    listOf,
    lookConsentWords,
} from "./consent-banner";
import { SITE_CONSENT_OFFSET, SITE_CONSENT_OPEN_EVENT } from "./consent-events";
import { CookieNotice } from "./cookie-notice";

describe("ConsentBanner (DEC-108)", () => {
    it("names the tools, links the notice, and offers Accept and Reject alike", () => {
        const onAccept = vi.fn();
        const onReject = vi.fn();
        render(
            <ConsentBanner
                tools={["Google Analytics", "Microsoft Clarity"]}
                noticeHref="/cookie-notice"
                onAccept={onAccept}
                onReject={onReject}
            />,
        );
        expect(
            screen.getByText(/Google Analytics and Microsoft Clarity/),
        ).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "What they do" })
                .getAttribute("href"),
        ).toBe("/cookie-notice");
        const accept = screen.getByRole("button", { name: "Accept" });
        const reject = screen.getByRole("button", { name: "Reject" });
        // Equal weight: the same look for both answers.
        expect(accept.className).toBe(reject.className);
        fireEvent.click(reject);
        expect(onReject).toHaveBeenCalledTimes(1);
        fireEvent.click(accept);
        expect(onAccept).toHaveBeenCalledTimes(1);
    });

    it("reports its height for the fixed bars while it shows, and clears it after", () => {
        const { unmount } = render(
            <ConsentBanner
                tools={["Meta Pixel"]}
                noticeHref="/cookie-notice"
                onAccept={vi.fn()}
                onReject={vi.fn()}
            />,
        );
        expect(
            document.documentElement.style.getPropertyValue(
                SITE_CONSENT_OFFSET,
            ),
        ).toMatch(/px$/);
        unmount();
        expect(
            document.documentElement.style.getPropertyValue(
                SITE_CONSENT_OFFSET,
            ),
        ).toBe("");
    });
});

describe("ConsentBanner under a look (DEC-172, U15)", () => {
    it.each(LOOK_IDS)(
        "%s: Reject and Accept are the same size and weight, side by side, and neither is filled",
        (look) => {
            const onAccept = vi.fn();
            const onReject = vi.fn();
            render(
                <ConsentBanner
                    look={look}
                    tools={["Google Analytics"]}
                    noticeHref="/cookie-notice"
                    onAccept={onAccept}
                    onReject={onReject}
                    countsVisits
                />,
            );
            const region = screen.getByRole("region", {
                name: "Cookies on this site",
            });
            expect(region.getAttribute("data-site-consent")).toBe("");
            const reject = screen.getByRole("button", { name: "Reject" });
            const accept = screen.getByRole("button", { name: "Accept" });
            expect(accept.className).toBe(reject.className);
            expect(accept.className).not.toMatch(/\bbg-site-accent\b/);
            // Side by side: two equal columns, Reject first.
            expect(reject.parentElement).toBe(accept.parentElement);
            expect(reject.parentElement?.className).toMatch(/grid-cols-2/);
            expect(
                reject.compareDocumentPosition(accept) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            expect(
                screen
                    .getByRole("link", { name: "Cookie notice" })
                    .getAttribute("href"),
            ).toBe("/cookie-notice");
            fireEvent.click(reject);
            expect(onReject).toHaveBeenCalledTimes(1);
            expect(onAccept).not.toHaveBeenCalled();
            fireEvent.click(accept);
            expect(onAccept).toHaveBeenCalledTimes(1);
        },
    );

    it("docks at the foot and lifts the page by its height, then clears it", () => {
        const { unmount } = render(
            <ConsentBanner
                look="quiet"
                tools={["Meta Pixel"]}
                noticeHref="/cookie-notice"
                onAccept={vi.fn()}
                onReject={vi.fn()}
            />,
        );
        const region = screen.getByRole("region");
        expect(region.getAttribute("data-site-consent-dock")).toBe("bottom");
        expect(
            document.documentElement.style.getPropertyValue(
                SITE_CONSENT_OFFSET,
            ),
        ).toMatch(/px$/);
        unmount();
        expect(
            document.documentElement.style.getPropertyValue(
                SITE_CONSENT_OFFSET,
            ),
        ).toBe("");
    });

    it("rises in over the look's step, never longer (data-site-rise)", () => {
        render(
            <ConsentBanner
                look="live"
                tools={["Meta Pixel"]}
                noticeHref="/cookie-notice"
                onAccept={vi.fn()}
                onReject={vi.fn()}
            />,
        );
        expect(screen.getByRole("region").hasAttribute("data-site-rise")).toBe(
            true,
        );
    });

    it("Classic draws exactly as before: no look marks", () => {
        render(
            <ConsentBanner
                tools={["Meta Pixel"]}
                noticeHref="/cookie-notice"
                onAccept={vi.fn()}
                onReject={vi.fn()}
            />,
        );
        expect(document.querySelector("[data-site-consent-dock]")).toBeNull();
        expect(screen.getByRole("link", { name: "What they do" })).toBeTruthy();
    });
});

describe("lookConsentWords", () => {
    it("says what runs before a choice, then names what waits for an OK", () => {
        expect(lookConsentWords(["Google Analytics"], true)).toBe(
            "We count visits without cookies. With your OK, we’d also use Google Analytics to see how people find and use this site.",
        );
        expect(
            lookConsentWords(["Google Analytics", "Microsoft Clarity"], false),
        ).toBe(
            "With your OK, we’d use Google Analytics and Microsoft Clarity to see how people find and use this site. Nothing of theirs runs until you choose.",
        );
    });
});

describe("CookieChoicesButton", () => {
    it("asks the page to reopen the banner", () => {
        const heard = vi.fn();
        window.addEventListener(SITE_CONSENT_OPEN_EVENT, heard);
        render(<CookieChoicesButton />);
        fireEvent.click(screen.getByRole("button", { name: "Cookie choices" }));
        expect(heard).toHaveBeenCalledTimes(1);
        window.removeEventListener(SITE_CONSENT_OPEN_EVENT, heard);
    });
});

describe("listOf", () => {
    it("joins names as a sentence would", () => {
        expect(listOf(["A"])).toBe("A");
        expect(listOf(["A", "B"])).toBe("A and B");
        expect(listOf(["A", "B", "C"])).toBe("A, B and C");
    });
});

describe("CookieNotice", () => {
    it("lists exactly the tools that run, and says whose data it is", () => {
        render(
            <CookieNotice
                siteName="Rye"
                tools={[
                    {
                        name: "Plausible",
                        purpose: "Counts visits.",
                        asks: false,
                    },
                    {
                        name: "Google Analytics",
                        purpose: "Counts visits.",
                        asks: true,
                    },
                ]}
            />,
        );
        expect(screen.getByText("Plausible")).toBeTruthy();
        expect(screen.getByText("Google Analytics")).toBeTruthy();
        expect(screen.getByText(/Runs only if you accept/)).toBeTruthy();
        expect(screen.getByText(/Ask Rye about your data/)).toBeTruthy();
    });

    it("under a look, sets the heading in the look's type with the same words", () => {
        render(<CookieNotice siteName="Rye" tools={[]} look="folio" />);
        const h1 = screen.getByRole("heading", {
            level: 1,
            name: "Cookies and visitor counting",
        });
        expect(h1.className).toMatch(/font-light/);
    });

    it("says so when the site uses none", () => {
        render(<CookieNotice siteName="Rye" tools={[]} />);
        expect(
            screen.getByText(/uses no analytics or advertising tools/),
        ).toBeTruthy();
    });
});

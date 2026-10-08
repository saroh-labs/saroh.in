import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConsentBanner, CookieChoicesButton, listOf } from "./consent-banner";
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

    it("says so when the site uses none", () => {
        render(<CookieNotice siteName="Rye" tools={[]} />);
        expect(
            screen.getByText(/uses no analytics or advertising tools/),
        ).toBeTruthy();
    });
});

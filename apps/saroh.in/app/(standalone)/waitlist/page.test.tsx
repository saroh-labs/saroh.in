// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NO_OFFER } from "@/content/waitlist";

/**
 * The waitlist page draws the API's launch offer (marketing plan U31): the
 * plan and days come from `GET /public/waitlist/offer`, the words from
 * `content/waitlist.ts`. With no offer it keeps "Offer details announced at
 * launch". It reads no query, so it renders statically. Plan B and 37 days
 * are made up.
 */
const readLaunchOffer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/launch-offer", () => ({ readLaunchOffer }));
vi.mock("@/env", () => ({ env: {} }));
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
vi.mock("next/font/local", () => ({
    default: () => ({ variable: "font-local", className: "font-local" }),
}));

afterEach(() => {
    cleanup();
    readLaunchOffer.mockReset();
});

async function renderPage() {
    const { default: WaitlistPage, revalidate } = await import("./page");
    expect(revalidate).toBe(300);
    // A static page takes no props: no searchParams to make it dynamic.
    expect(WaitlistPage.length).toBe(0);
    return render(await WaitlistPage());
}

describe("/waitlist", () => {
    it("shows the API's launch offer in the card's lead and terms", async () => {
        readLaunchOffer.mockResolvedValue({ planName: "Plan B", days: 37 });
        await renderPage();

        expect(
            screen.getByText("37 days of Plan B free").parentElement
                ?.textContent,
        ).toBe("Get 37 days of Plan B free when we open.");
        expect(screen.queryByText(new RegExp(NO_OFFER.note))).toBeNull();
        expect(
            screen.getByText(
                /No card needed\. When it ends, you stay on Free unless you choose a plan\./,
            ),
        ).toBeTruthy();
    });

    it("without an offer, keeps 'Offer details announced at launch'", async () => {
        readLaunchOffer.mockResolvedValue(null);
        await renderPage();

        expect(
            screen.getByText(NO_OFFER.headline).parentElement?.textContent,
        ).toBe(`Get ${NO_OFFER.headline} when we open. ${NO_OFFER.note}`);
        expect(screen.queryByText(/days of/)).toBeNull();
        expect(screen.queryByText(/No card needed/)).toBeNull();
    });
});

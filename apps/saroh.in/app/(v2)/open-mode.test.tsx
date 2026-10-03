// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Launch (plan U27, KTD-16): with `NEXT_PUBLIC_LAUNCH_MODE=open`, every
 * "start" button on Home, a feature and a solution page, and in the
 * nav, goes to sign-up on accounts with the plan it names, and none to the
 * waitlist. The waitlist page still renders: launch moves the buttons, it
 * doesn't delete the page.
 */
const ACCOUNTS = "https://accounts.example.test";

vi.mock("@/env", () => ({
    env: {
        NEXT_PUBLIC_LAUNCH_MODE: "open",
        NEXT_PUBLIC_ACCOUNTS_URL: "https://accounts.example.test",
    },
}));
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
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
vi.mock("next/font/local", () => ({
    default: () => ({ variable: "font-local", className: "font-local" }),
}));

afterEach(cleanup);

const START = /^(Start free|Choose .+|Start \d+-day trial)$/;

/** Every link on the page: its words and where it goes. */
function links(container: HTMLElement) {
    return Array.from(container.querySelectorAll("a")).map((a) => ({
        label: a.textContent.trim(),
        href: a.getAttribute("href") ?? "",
    }));
}

function expectOpen(container: HTMLElement): void {
    const all = links(container);
    expect(all.filter((l) => l.href.includes("/waitlist"))).toEqual([]);
    const starts = all.filter((l) => START.test(l.label));
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) {
        expect(s.href.startsWith(`${ACCOUNTS}/signup?`)).toBe(true);
    }
}

const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });

describe("open mode (U27)", () => {
    it("Home: every start button goes to sign-up", async () => {
        const { default: HomePage } = await import("./page");
        const { container } = render(HomePage());
        expectOpen(container);
    });

    it("a feature and a solution page: to sign-up", async () => {
        const { default: FeaturePage } = await import("./features/[slug]/page");
        expectOpen(render(await FeaturePage(slug("billing"))).container);
        cleanup();
        const { default: SolutionPage } =
            await import("./solutions/[slug]/page");
        expectOpen(render(await SolutionPage(slug("gyms"))).container);
    });

    it("the nav: Start free to sign-up", async () => {
        const { SiteNav } = await import("@/components/v2/site-nav");
        const { container } = render(<SiteNav />);
        expectOpen(container);
    });

    it("the waitlist page still renders", async () => {
        const { default: WaitlistPage } =
            await import("../(standalone)/waitlist/page");
        const page = await WaitlistPage();
        const { container } = render(page);
        expect(container.querySelector("form")).not.toBeNull();
    });
});

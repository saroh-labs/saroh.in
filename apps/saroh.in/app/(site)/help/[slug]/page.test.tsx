// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * One Help article (plan 2026-11-13-002, U9): "If it doesn't work" under
 * the steps when the article has troubles, and none when it hasn't; an
 * article waiting on a switch that is off is a 404.
 */
const env = vi.hoisted(() => ({ NEXT_PUBLIC_AI_APPS: "on" }));
vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/browser/env", () => ({ browserEnv: env }));
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
vi.mock("next/navigation", () => ({
    usePathname: () => "/help",
    useRouter: () => ({ push: vi.fn() }),
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

import HelpArticlePage from "./page";

afterEach(() => {
    cleanup();
    env.NEXT_PUBLIC_AI_APPS = "on";
});

const open = async (slug: string) =>
    render(await HelpArticlePage({ params: Promise.resolve({ slug }) }));

describe("/help/[slug]", () => {
    it("draws If it doesn't work under the steps, in On this page too", async () => {
        await open("connect-claude");
        const heading = screen.getByRole("heading", {
            level: 2,
            name: "If it doesn't work",
        });
        expect(heading.id).toBe("if-it-doesnt-work");
        expect(
            screen.getByRole("heading", {
                level: 3,
                name: "Claude says it couldn't connect.",
            }),
        ).toBeTruthy();
        expect(
            document.querySelector('a[href="#if-it-doesnt-work"]'),
        ).not.toBeNull();
    });

    it("draws none for an article without troubles", async () => {
        await open("connect-razorpay");
        expect(
            screen.queryByRole("heading", { name: "If it doesn't work" }),
        ).toBeNull();
    });

    it("is a 404 while the article's switch is off", async () => {
        env.NEXT_PUBLIC_AI_APPS = "off";
        await expect(open("connect-claude")).rejects.toThrow("NEXT_NOT_FOUND");
    });
});

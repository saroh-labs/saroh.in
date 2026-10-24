// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChangelogEntryPage from "./page";

/** One changelog entry (#1186): the entry and its sign-off, no waitlist card. */
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
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("/changelog/[slug]", () => {
    it("draws the entry with no waitlist card", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-24T06:00:00Z"));
        const { container } = render(
            await ChangelogEntryPage({
                params: Promise.resolve({ slug: "saroh-is-open" }),
            }),
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Early access is open",
            }),
        ).toBeTruthy();
        expect(container.textContent).not.toMatch(/waitlist|invite is in/i);
    });
});

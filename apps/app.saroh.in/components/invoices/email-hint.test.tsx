import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmailHint } from "./invoice-detail";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("why an invoice can't be emailed, per plan (UX-006)", () => {
    it("Free: names the plan and links to it, not to Providers", () => {
        const html = renderToStaticMarkup(
            <EmailHint
                lock={{
                    comesWith: "Comes with Grow",
                    cta: "See Grow",
                    href: "/settings/billing?plan=grow#change-plan",
                    upgrade: "Grow",
                    full: false,
                }}
            />,
        );
        expect(html).toContain("which comes with Grow");
        expect(html).toContain(
            'href="/settings/billing?plan=grow#change-plan"',
        );
        expect(html).not.toContain('href="/settings/providers"');
    });

    it("Grow: the way to Providers", () => {
        const html = renderToStaticMarkup(<EmailHint lock={null} />);
        expect(html).toContain("connect your email provider");
        expect(html).toContain('href="/settings/providers"');
    });
});

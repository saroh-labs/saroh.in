import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProviderEntry } from "@/lib/providers/rows";

import { ProviderRowView } from "./provider-row";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

/** A row it could connect, Razorpay, never connected. */
const razorpay: ProviderEntry = {
    key: "payments:RAZORPAY",
    name: "Razorpay",
    type: "Payments",
    state: "NOT_CONNECTED",
    note: "",
    fix: null,
    update: null,
    refs: [],
    manageHref: null,
    target: null,
    setup: { kind: "payments", provider: "RAZORPAY" },
    consequence: "",
};

const render = (entry: ProviderEntry) =>
    renderToStaticMarkup(
        <ProviderRowView
            entry={entry}
            payments={[]}
            messaging={[]}
            webhooks={null}
        />,
    );

describe("a provider row the plan won't let the business connect (UX-006)", () => {
    it("Free: says the plan and See plans; no Connect, so no key form", () => {
        const html = render({
            ...razorpay,
            lock: {
                comesWith: "Comes with Grow",
                cta: "See Grow",
                href: "/settings/billing?plan=grow#change-plan",
                upgrade: "Grow",
                full: false,
            },
        });
        expect(html).toContain("Comes with Grow");
        expect(html).toContain(
            'href="/settings/billing?plan=grow#change-plan"',
        );
        expect(html).not.toContain(">Connect<");
    });

    it("Grow: Connect", () => {
        const html = render(razorpay);
        expect(html).toContain("Connect");
        expect(html).not.toContain("Comes with");
    });
});

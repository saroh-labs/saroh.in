import type { Edition } from "@saroh/edition";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TurnOnDraft } from "@/lib/modules/turn-on";

import { ConnectChoice } from "./setup-fields";

const edition: { name: Edition } = vi.hoisted(() => ({ name: "INDIA" }));
vi.mock("@/lib/edition", async (actual) => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        ...(await actual<object>()),
        get PROFILE() {
            return editionProfile(edition.name);
        },
    };
});
afterEach(() => {
    edition.name = "INDIA";
});

const html = () =>
    renderToStaticMarkup(
        <ConnectChoice
            moduleKey="PAYMENTS"
            draft={{ connect: {} } as unknown as TurnOnDraft}
            update={() => undefined}
        />,
    );

describe("Payments' Connect choice names the edition's providers", () => {
    it("India: Razorpay or Cashfree, as before", () => {
        expect(html()).toContain("Connect Razorpay or Cashfree now");
    });

    it("Global: Stripe only", () => {
        edition.name = "GLOBAL";
        expect(html()).toContain("Connect Stripe now");
        expect(html()).not.toMatch(/Razorpay|Cashfree/);
    });
});

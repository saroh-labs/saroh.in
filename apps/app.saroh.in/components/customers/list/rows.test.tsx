// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import { BusinessZoneProvider } from "@/components/shared/dates/business-zone";
import type { CustomersPage } from "@/lib/customers/list";

import { Rows } from "./rows";

vi.mock("next/link", () => ({
    default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const s = stage();
beforeEach(s.mount);
afterEach(s.unmount);

describe("Rows: Last order", () => {
    it("is written in the business's zone, as the Orders list writes it", () => {
        const page = {
            sees: { orders: true, spent: false },
            storefronts: [],
            rows: [
                {
                    contactId: "c1",
                    name: "Maya Thompson",
                    attention: [],
                    orders: {
                        count: 1,
                        open: 0,
                        lastAt: "2026-01-15T12:40:00.000Z",
                    },
                },
            ],
        } as unknown as CustomersPage;
        s.render(
            // Far from any test machine's zone: UTC+14.
            <BusinessZoneProvider zone="Pacific/Kiritimati">
                <Rows page={page} empty={null} />
            </BusinessZoneProvider>,
        );
        expect(document.body.textContent).toContain("16 Jan");
    });
});

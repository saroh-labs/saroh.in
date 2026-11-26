// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { navFor } from "@/components/shared/navigation/nav-items";

import { cameFrom, useNavPathname } from "./use-nav-pathname";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const groups = navFor({ role: "OWNER", moduleKeys: ["CRM", "COMMERCE"] });

/** Renders the hook at each address in turn; what it marked at the last. */
function walk(...paths: string[]): string {
    let marked = "";
    function Probe() {
        marked = useNavPathname(groups);
        return null;
    }
    const root = createRoot(document.createElement("div"));
    for (const path of paths) {
        pathname = path;
        act(() => root.render(<Probe key={path} />));
    }
    act(() => root.unmount());
    return marked;
}

describe("the rail follows where the person came from (DEC-264)", () => {
    it("keeps Customers lit on a person opened from Customers", () => {
        expect(walk("/commerce/customers", "/contacts/c_1")).toBe(
            "/commerce/customers",
        );
        expect(cameFrom()).toBe("/commerce/customers");
    });

    it("keeps Contacts lit on a person opened from Contacts", () => {
        expect(walk("/contacts", "/contacts/c_1")).toBe("/contacts");
    });

    it("falls back to Contacts from anywhere else", () => {
        expect(walk("/bookings", "/contacts/c_1")).toBe("/contacts");
    });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ShellTemplate from "@/app/(shell)/template";

import { fadesIn, routeSection } from "./route-fade";

vi.mock("next/navigation", () => ({ usePathname: () => "/commerce/orders" }));

describe("the route fade plays only on a move to another section", () => {
    it("reads an address's section from the rail", () => {
        expect(routeSection("/")).toBe("/");
        expect(routeSection("/commerce/orders/ord_1")).toBe("/commerce/orders");
        expect(routeSection("/commerce/products")).toBe("/commerce/products");
        expect(routeSection("/bookings/availability")).toBe(
            "/bookings/availability",
        );
        expect(routeSection("/settings/team")).toBe("/settings");
    });

    it("plays on a click to a different section", () => {
        expect(fadesIn("/commerce/orders", "/settings", false)).toBe(true);
        expect(fadesIn("/", "/commerce/orders", false)).toBe(true);
    });

    it("not on the first page of a visit", () => {
        expect(fadesIn(null, "/commerce/orders", false)).toBe(false);
    });

    it("not on Back or Forward", () => {
        expect(fadesIn("/settings", "/commerce/orders", true)).toBe(false);
    });

    it("not on a move within one section", () => {
        expect(
            fadesIn("/commerce/orders", "/commerce/orders/ord_1", false),
        ).toBe(false);
        expect(fadesIn("/settings/team", "/settings/profile", false)).toBe(
            false,
        );
        // Each row is its own section since the regroup (DEC-262).
        expect(fadesIn("/bookings", "/services", false)).toBe(true);
    });
});

describe("the shell's template", () => {
    it("draws the first page without the fade", () => {
        const html = renderToStaticMarkup(
            createElement(ShellTemplate, null, "page"),
        );
        expect(html).toContain("page");
        expect(html).not.toContain("wk-route");
    });
});

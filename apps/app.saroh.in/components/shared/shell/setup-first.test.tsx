/**
 * B5: someone with no business on this edition (none, or only the other
 * edition's: the list is this edition's only, `listOrganizations`) is sent
 * to setup from a business page, as Home does, never "Couldn't load your
 * business details". Their invitation, join link and profile still open.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
    path: "/",
    sentTo: [] as string[],
}));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.path,
    redirect: (to: string) => {
        nav.sentTo.push(to);
        throw new Error(`REDIRECT ${to}`);
    },
}));

import { SetupFirst } from "./setup-first";

const draw = (path: string) => {
    nav.path = path;
    return renderToStaticMarkup(<SetupFirst>page</SetupFirst>);
};

describe("no business on this edition", () => {
    beforeEach(() => {
        nav.sentTo = [];
    });

    it("a business page sends them to setup", () => {
        for (const path of [
            "/settings/organization",
            "/settings",
            "/orders",
            "/customers/abc",
        ]) {
            expect(() => draw(path)).toThrow("REDIRECT /onboarding");
        }
    });

    it("their invitation, join link and profile still open", () => {
        expect(draw("/invitations/tok")).toBe("page");
        expect(draw("/join/tok")).toBe("page");
        expect(draw("/settings/profile")).toBe("page");
        expect(nav.sentTo).toEqual([]);
    });
});

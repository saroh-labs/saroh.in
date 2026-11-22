// @vitest-environment jsdom
// The Hours screen's Our team line (round 3): read only, shown only while
// the person is on the page; "Change in Website" for owners and admins.
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/sites/website-area", () => ({
    useWebsiteArea: () => true,
}));

import type { StaffView } from "@/lib/staff/types";

import { TeamPageSwitch } from "./team-page-switch";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const person = (on: boolean) =>
    ({ id: "st_1", name: "Asha", showOnTeamPage: on }) as StaffView;

describe("TeamPageSwitch", () => {
    it("says nothing for someone not on the page", () => {
        act(() =>
            root.render(<TeamPageSwitch person={person(false)} canManage />),
        );
        expect(host.textContent).toBe("");
    });

    it("is a read-only line, with Change in Website only for owners and admins", () => {
        act(() =>
            root.render(<TeamPageSwitch person={person(true)} canManage />),
        );
        expect(host.textContent).toContain("On the website's Our team page");
        expect(host.querySelector("a")?.textContent).toBe("Change in Website");
        expect(host.querySelector("[role=switch]")).toBeNull();
        act(() =>
            root.render(
                <TeamPageSwitch person={person(true)} canManage={false} />,
            ),
        );
        expect(host.querySelector("a")).toBeNull();
    });
});

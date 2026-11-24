// @vitest-environment jsdom
/**
 * Choosing another business (DEC-259): once the switch is saved, every
 * tab's React Query cache is dropped and the other tabs told, before the
 * page is drawn again under the new business. A refused switch drops
 * nothing.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Organization } from "@/lib/organizations/service";

import { OrganizationSwitcher } from "./organization-switcher";

const calls = vi.hoisted(() => [] as string[]);
const setActive = vi.hoisted(() => vi.fn());
vi.mock("@/lib/organizations/actions", () => ({
    setActiveOrganization: (id: string) => setActive(id) as unknown,
}));
vi.mock("@/lib/api/run-action", () => ({
    runAction: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/query/invalidate", () => ({
    afterSwitch: () => calls.push("afterSwitch"),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: () => calls.push("refresh") }),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: (m: string) => calls.push(`error:${m}`),
}));
// The popover's content, always drawn: the rows are what's under test.
vi.mock("@saroh/ui/popover", () => ({
    Popover: ({ children }: { children: React.ReactNode }) => children,
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
    PopoverContent: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
}));

const org = (id: string, name: string): Organization => ({
    id,
    name,
    slug: id,
    role: "OWNER",
});
const ORGS = [org("o1", "Northwind"), org("o2", "Rye & Co.")];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    calls.length = 0;
    setActive.mockReset();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

async function choose(name: string) {
    act(() =>
        root.render(
            <OrganizationSwitcher organizations={ORGS} activeOrgId="o1" />,
        ),
    );
    const row = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.includes(name) && !b.getAttribute("aria-label"),
    );
    if (!row) throw new Error(`No row for ${name}`);
    await act(async () => {
        row.click();
        await new Promise((r) => setTimeout(r, 0));
    });
}

describe("OrganizationSwitcher", () => {
    it("a saved switch clears every tab's cache, then draws the page again", async () => {
        setActive.mockResolvedValue({ ok: true, data: { id: "o2" } });
        await choose("Rye & Co.");
        expect(setActive).toHaveBeenCalledWith("o2");
        expect(calls).toEqual(["afterSwitch", "refresh"]);
    });

    it("a refused switch clears nothing", async () => {
        setActive.mockResolvedValue({ ok: false, error: "Not yours." });
        await choose("Rye & Co.");
        expect(calls).toEqual(["error:Not yours."]);
    });
});

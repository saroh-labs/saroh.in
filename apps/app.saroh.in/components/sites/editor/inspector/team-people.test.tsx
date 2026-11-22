// @vitest-environment jsdom
// Our team's People list (round 3, EBTeamPicker 1): an owner or admin takes
// someone off (the chosen set saved first); anyone else reads the list.
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const read = vi.fn();
const setTeamPage = vi.fn();
vi.mock("@/lib/staff/team-picker-read", () => ({
    readTeamForPicker: () => read() as unknown,
}));
vi.mock("@/lib/staff/actions", () => ({
    setTeamPage: (...a: unknown[]) => setTeamPage(...a) as unknown,
}));

import { TeamPeople } from "./team-people";

const person = (id: string, name: string) => ({
    id,
    name,
    title: null,
    status: "ACTIVE",
    showOnTeamPage: true,
    membership: null,
});
const content = {
    variant: "team",
    staffId: "st_1",
    name: "Asha Rao",
    people: [{ staffId: "st_2", name: "Farah Sheikh" }],
};

const only = { variant: "team", staffId: "st_1", name: "Asha Rao" };

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
    vi.clearAllMocks();
});

async function render(canChoose: boolean) {
    read.mockResolvedValue({
        canChoose,
        team: [person("st_1", "Asha Rao"), person("st_2", "Farah Sheikh")],
    });
    const onChange = vi.fn();
    await act(async () => {
        root.render(<TeamPeople content={content} onChange={onChange} />);
        await Promise.resolve();
    });
    return onChange;
}

describe("TeamPeople", () => {
    it("an owner or admin takes someone off: saved, then off the section", async () => {
        setTeamPage.mockResolvedValue({
            ok: true,
            data: { staffIds: ["st_2"] },
        });
        const onChange = await render(true);
        expect(host.textContent).toContain("People on this page · 2");
        const x = host.querySelector<HTMLButtonElement>(
            'button[aria-label="Take Asha Rao off this page"]',
        );
        await act(async () => {
            x?.click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(setTeamPage).toHaveBeenCalledWith(["st_2"]);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ staffId: "st_2", name: "Farah Sheikh" }),
        );
    });

    it("takes the last person off too, leaving the team empty (ER3 bug 1)", async () => {
        setTeamPage.mockResolvedValue({ ok: true, data: { staffIds: [] } });
        read.mockResolvedValue({
            canChoose: true,
            team: [person("st_1", "Asha Rao")],
        });
        const onChange = vi.fn();
        await act(async () => {
            root.render(<TeamPeople content={only} onChange={onChange} />);
            await Promise.resolve();
        });
        const x = host.querySelector<HTMLButtonElement>(
            'button[aria-label="Take Asha Rao off this page"]',
        );
        expect(x?.disabled).toBe(false);
        await act(async () => {
            x?.click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(setTeamPage).toHaveBeenCalledWith([]);
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ variant: "team", name: "" }),
        );
        const sent = onChange.mock.calls[0]?.[0] as { staffId?: string };
        expect(sent.staffId).toBeUndefined();
    });

    it("anyone else reads the list, with nothing to change", async () => {
        await render(false);
        expect(host.textContent).toContain("Farah Sheikh");
        expect(host.querySelector('button[aria-label^="Take"]')).toBeNull();
        expect(host.textContent).not.toContain("Add people");
        expect(host.textContent).toContain("Others see this list read-only.");
    });
});

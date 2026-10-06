import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { HomeModel } from "@/lib/home/service";
import type { ModuleView } from "@/lib/modules/schema";

import { HomeDashboard } from "./home-dashboard";

/**
 * Home's first run when nothing reads as on (#837): an Owner or Admin is
 * never told to wait for "someone who manages it" — it's them — and a
 * business whose picks the plan holds is told so, not that it never picked.
 */
const HOME = { hasAnyModule: false } as HomeModel;

const mod = (over: Partial<ModuleView> = {}): ModuleView => ({
    key: "COMMERCE",
    label: "Sell",
    lifecycle: "ENABLED",
    readiness: "DISABLED",
    selectedForProject: true,
    canManage: true,
    dependencies: [],
    blockers: [{ code: "ENTITLEMENT_REQUIRED" }],
    ...over,
});

const render = (modules: ModuleView[]) =>
    renderToStaticMarkup(
        <HomeDashboard home={HOME} modules={modules} businessName="Rye" />,
    );

describe("Home's first run copy", () => {
    it("tells an owner the plan holds what is on, with the way to plans", () => {
        const html = render([mod()]);
        expect(html).toContain("isn&#x27;t in your plan");
        expect(html).toContain("See plans");
        expect(html).not.toContain("Once someone who manages it");
    });

    it("tells someone who can't change the plan who can", () => {
        const html = render([mod({ canManage: false })]);
        expect(html).toContain("The owner can change the plan");
        expect(html).not.toContain("See plans");
    });

    it("gives an owner the choices when nothing else applies", () => {
        const html = render([mod({ blockers: [] })]);
        expect(html).toContain("Choose what it does");
        expect(html).not.toContain("Once someone who manages it");
    });

    it("keeps the wait line for someone who may not turn things on", () => {
        const html = render([mod({ canManage: false, blockers: [] })]);
        expect(html).toContain("Once someone who manages it does");
    });
});

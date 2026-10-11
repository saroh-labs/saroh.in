import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every create and edit flow asks through the one guard
 * (`components/shared/use-leave-guard.tsx`). A flow added later belongs in
 * this list; one that drops the guard, or grows a question of its own,
 * fails here.
 */
const APP = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(APP, file), "utf8");

/** The flow, and the file that mounts the guard for it. */
const FLOWS: [flow: string, file: string][] = [
    ["plan", "components/editor-shell/editor-shell.tsx"],
    ["class pack", "components/editor-shell/editor-shell.tsx"],
    ["product", "components/commerce/product-editor-v2/editor-shell.tsx"],
    ["service", "components/services/service-editor/service-editor.tsx"],
    ["post", "components/sites/post-editor.tsx"],
    ["site editor", "components/sites/editor/use-editor-leave.ts"],
    [
        "product settings",
        "components/commerce/product-settings/product-settings.tsx",
    ],
    ["invoice", "components/invoices/invoice-form.tsx"],
    ["course", "components/courses/course-form.tsx"],
    ["discount", "components/stores/discount-form.tsx"],
    ["customer (new)", "components/customers/add-customer-form.tsx"],
    ["location (new)", "components/stores/create-store-form.tsx"],
    ["create site", "components/sites/create-site-form.tsx"],
    ["CSV import review", "components/stores/csv-import.tsx"],
    [
        "availability",
        "components/bookings/availability/availability-editor.tsx",
    ],
    ["stock count", "components/commerce/stock/stock-screen.tsx"],
];

describe("the leave guard is mounted in every create and edit flow", () => {
    it.each(FLOWS)("%s", (_flow, file) => {
        const src = read(file);
        expect(src).toContain('from "@/components/shared/use-leave-guard"');
        expect(src).toMatch(/useLeaveGuard\(\{/);
        // Says what would be lost, and tells the guard when.
        expect(src).toMatch(/\bdirty\b/);
        expect(src).toMatch(/\blost:/);
    });

    it("draws the question wherever the guard is called", () => {
        for (const [flow, file] of FLOWS) {
            // The site editor's hook hands the guard to `site-editor.tsx`.
            const drawn =
                file === "components/sites/editor/use-editor-leave.ts"
                    ? "components/sites/site-editor.tsx"
                    : file;
            expect(read(drawn), flow).toMatch(/[gG]uard\.dialog\}/);
        }
    });

    it("the plan and pack editors are the shared shell", () => {
        for (const file of [
            "components/subscriptions/plan-editor/plan-editor.tsx",
            "components/class-packs/pack-editor/pack-editor.tsx",
        ]) {
            expect(read(file)).toContain("EditorShell");
        }
    });
});

describe("there is one guard and one question", () => {
    it("the copies are gone", () => {
        for (const gone of [
            "components/sites/use-leave-guard.ts",
            "components/editor-shell/leave-guard.tsx",
        ]) {
            expect(existsSync(path.join(APP, gone)), gone).toBe(false);
        }
        expect(
            read("components/commerce/product-editor-v2/editor-parts.tsx"),
        ).not.toContain("LeaveDialog");
    });

    it("no flow words the question itself", () => {
        for (const [flow, file] of FLOWS) {
            const src = read(file);
            for (const old of [
                "Leave without creating it?",
                "Leave without saving it?",
                "Leave with unsaved changes?",
                "Leave without saving?",
                "beforeunload",
            ]) {
                expect(src, `${flow}: ${old}`).not.toContain(old);
            }
        }
    });
});

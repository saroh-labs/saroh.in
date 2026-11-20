import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every create and edit flow asks through the one guard
 * (`@saroh/ui/use-leave-guard`). A flow added later belongs in
 * this list; one that drops the guard, or grows a question of its own,
 * fails here.
 */
const APP = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(APP, file), "utf8");

/** The flow, and the file that mounts the guard for it. */
const FLOWS: [flow: string, file: string][] = [
    ["plan", "components/editor-shell/editor-shell.tsx"],
    ["class pack", "components/editor-shell/editor-shell.tsx"],
    ["product", "components/commerce/product-editor-v2/editor-shell.tsx"],
    ["service (new)", "components/services/service-editor/new-service.tsx"],
    ["post", "components/sites/posts/editor/use-post-draft.ts"],
    ["site editor", "components/sites/editor/use-editor-leave.ts"],
    [
        "product settings",
        "components/commerce/product-settings/product-settings.tsx",
    ],
    ["invoice", "components/invoices/new-invoice/invoice-form.tsx"],
    ["course", "components/courses/course-form.tsx"],
    ["discount", "components/stores/discounts/discount-form.tsx"],
    [
        "customer (new)",
        "components/customers/store-customer/add-customer-form.tsx",
    ],
    ["location (new)", "components/stores/locations/create-store-form.tsx"],
    ["create site", "components/sites/new-site/create-site-form.tsx"],
    ["CSV import review", "components/stores/import/csv-import.tsx"],
    ["stock count", "components/commerce/stock/stock-screen.tsx"],
];

/** A guard made in a hook is drawn by the screens that call it. */
const DRAWN_BY: Record<string, string[]> = {
    "components/sites/editor/use-editor-leave.ts": [
        "components/sites/editor/site-editor.tsx",
    ],
    "components/sites/posts/editor/use-post-draft.ts": [
        "components/sites/posts/post-editor.tsx",
        "components/sites/posts/editor/post-shell.tsx",
    ],
};

describe("the leave guard is mounted in every create and edit flow", () => {
    it.each(FLOWS)("%s", (_flow, file) => {
        const src = read(file);
        expect(src).toContain('from "@saroh/ui/use-leave-guard"');
        expect(src).toMatch(/useLeaveGuard\(\{/);
        // Says what would be lost, and tells the guard when.
        expect(src).toMatch(/\bdirty\b/);
        expect(src).toMatch(/\blost:/);
    });

    it("draws the question wherever the guard is called", () => {
        for (const [flow, file] of FLOWS) {
            // A hook hands the guard to the screens that draw it: the site
            // editor's to `site-editor.tsx`, a post's to both post editors.
            const drawn = DRAWN_BY[file] ?? [file];
            for (const at of drawn) {
                expect(read(at), flow).toMatch(/[gG]uard\.dialog\}/);
            }
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

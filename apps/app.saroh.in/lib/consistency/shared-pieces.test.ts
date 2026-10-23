import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The small shared pieces stay the only way (UX consistency, wave B).
 *
 * Tabs, segmented switches, search, status badges, notices, links, copy and
 * progress bars are each built once (`@saroh/ui`, `components/shared`).
 * Every screen was moved onto them, and these scans fail when a screen
 * draws its own again. A real exception goes on the list beside the rule,
 * with its reason: the list is the record of what is not yet on the shared
 * piece.
 */

const APP = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".next", ".turbo", ".open-next"]);

function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (
            /\.tsx?$/.test(name) &&
            !/\.(test|spec)\.tsx?$/.test(name) &&
            !name.endsWith(".d.ts")
        ) {
            out.push(full);
        }
    }
    return out;
}

const FILES = ["app", "components", "lib"]
    .flatMap((d) => sources(path.join(APP, d)))
    .map((file) => ({
        rel: path.relative(APP, file).split(path.sep).join("/"),
        // Comments describe the old looks; only code is held to the rule.
        code: readFileSync(file, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, ""),
    }));

/** Files, outside `allow`, whose code matches. */
function offenders(pattern: RegExp, allow: Record<string, string> = {}) {
    return FILES.filter((f) => !(f.rel in allow) && pattern.test(f.code)).map(
        (f) => f.rel,
    );
}

/** An allowlist entry that no longer needs its exception should leave it. */
function stale(pattern: RegExp, allow: Record<string, string>) {
    return Object.keys(allow).filter((rel) => {
        const file = FILES.find((f) => f.rel === rel);
        return !file || !pattern.test(file.code);
    });
}

describe("one of each small piece", () => {
    it("no hand-rolled tab strip: role=tablist belongs to TabStrip", () => {
        const allow = {
            "components/shared/page/section-list.tsx":
                "the one vertical list of sections, shared by Settings and Website › Settings",
        };
        const pattern = /role="tablist"/;
        expect(offenders(pattern, allow)).toEqual([]);
        expect(stale(pattern, allow)).toEqual([]);
    });

    it("no clipboard call outside the copy pieces", () => {
        // `copyText`, `useCopy`, `CopyButton` and `ShareLink` live in
        // `@saroh/ui/copy-button`; nothing in the app touches the API.
        expect(offenders(/navigator\.clipboard/)).toEqual([]);
    });

    it("no boxed alert or status drawn by hand: that is Notice", () => {
        const allow = {
            "components/commerce/orders/bulk-bar.tsx":
                "the bulk bar's ten-second hold, a floating toolbar with Undo and Send now",
            "components/invoices/list/source-filter.tsx":
                "the chip that says a list is narrowed to one pack or course",
            "components/sites/settings/publish-bar.tsx":
                "the sticky publish bar: an action bar that also says what is waiting",
            "components/subscriptions/subscription-detail/panels.tsx":
                "a list's last line (\"Couldn't load more\"), ruled off above, not a box",
            "components/subscriptions/list/subscription-quick-look.tsx":
                "a list's last line, ruled off above, not a box",
        };
        // An element with an alert, status or note role that also draws
        // its own box: a fill, an edge or corners.
        const pattern =
            /<(?:div|p|span|section)\s[^>]*?role=(?:"(?:alert|status|note)"|\{[^}]*"alert"[^}]*\})[^>]*?className=(?:"[^"]*(?:\bbg-|\bborder\b|\brounded)[^"]*"|\{cn\(\s*"[^"]*(?:\bbg-|\bborder\b|\brounded))/;
        expect(offenders(pattern, allow)).toEqual([]);
        expect(stale(pattern, allow)).toEqual([]);
    });

    it("no uppercase outside the .label utility", () => {
        const allow = {
            "components/invoices/new-invoice/customer-block.tsx":
                "the HSN/SAC code field: a code is typed and kept in capitals",
            "components/organizations/tax/business-tax-fields.tsx":
                "the GSTIN field: a registration number is capitals",
            "components/organizations/setup/setup-billing-step.tsx":
                "a new billing profile's GSTIN field: a registration number is capitals",
            "components/settings/plan-billing/invoice-details.tsx":
                "the GSTIN field: a registration number is capitals",
            "components/settings/plan-billing/plan-chooser.tsx":
                "the offer code field: a code is capitals",
            "components/stores/discounts/discount-form.tsx":
                "the discount code field: a code is capitals",
        };
        const pattern = /(?<![\w-])uppercase(?![\w-])/;
        expect(offenders(pattern, allow)).toEqual([]);
        expect(stale(pattern, allow)).toEqual([]);
    });

    it("Saffron is the menu's current-page marker and Button variant=highlight, nothing else", () => {
        const allow = {
            "components/shared/shell/app-sidebar.tsx":
                "the menu's current-page marker and label, at the desk",
            "components/shared/shell/tab-bar.tsx":
                "the menu's current-page marker, on a phone",
        };
        const pattern =
            /(?<![\w-])(?:text-brand|bg-brand-subtle|bg-highlight|decoration-brand|border-brand|border-highlight|text-highlight)(?![\w-]*-surface)|hsl\(var\(--(?:brand|highlight)\)\)/;
        expect(offenders(pattern, allow)).toEqual([]);
        expect(stale(pattern, allow)).toEqual([]);
    });

    it("no transition-all, pulse, linear ease or literal duration", () => {
        expect(
            offenders(
                /(?<![\w-])(?:transition-all|animate-pulse|ease-linear|duration-(?:75|100|150|200|300|500|700|1000))(?![\w-])/,
            ),
        ).toEqual([]);
    });

    it("a GST rate is chosen with GstRatePicker, never a box (DEC-176)", () => {
        // The rate lists are read by the picker (through `MAIN_GST_RATES`
        // and `OTHER_GST_RATE_CHOICES`) and nowhere else: a screen that
        // takes `GST_RATE_OPTIONS` or `GST_RATE_CHOICES` is drawing the
        // rates its own way, a dropdown or chips of its own.
        const allow = {
            "lib/invoices/gst.ts": "where the one list of rates is written",
        };
        const pattern = /\bGST_RATE_(?:OPTIONS|CHOICES)\b/;
        expect(offenders(pattern, allow)).toEqual([]);
        expect(stale(pattern, allow)).toEqual([]);
    });

    it("the old pill, tab and segmented pieces stay deleted", () => {
        expect(
            offenders(
                /from "@\/components\/(?:subscriptions\/pill|invoices\/invoice-pill|shared\/segmented|shared\/settings-tab-strip|stores\/location-tabs)"|\b(?:StatePill|InvoicePill|RowPill|StepPillClass|chipBtn)\b/,
            ),
        ).toEqual([]);
    });
});

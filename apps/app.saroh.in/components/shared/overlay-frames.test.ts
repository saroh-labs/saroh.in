import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One sheet, one dialog, one confirm. Every `*-sheet.tsx` and
 * `*-dialog.tsx` in the app draws `FormSheet`, `FormDialog` or
 * `ConfirmDialog` (or a wrapper that does), nothing writes a raw
 * `AlertDialog` but the confirm, and nothing draws a sheet's or dialog's
 * frame by hand outside the short list of things that are not forms.
 */
const APP = path.resolve(__dirname, "../..");
const rel = (file: string) => path.relative(APP, file);

function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const at = path.join(dir, e.name);
        if (e.isDirectory()) walk(at, out);
        else if (
            e.name.endsWith(".tsx") &&
            !e.name.includes(".test.") &&
            !e.name.includes(".test-kit.")
        ) {
            out.push(at);
        }
    }
    return out;
}

const FILES = [
    ...walk(path.join(APP, "components")),
    ...walk(path.join(APP, "app")),
];
const read = (file: string) => readFileSync(file, "utf8");

/** The frames, and the wrappers that only draw one of them. */
const FRAMES =
    /\b(FormSheet|FormDialog|ConfirmDialog|NameDialog|QuickSheet|OrderSheet|PlaceSheetFrame|FormSheetBody|FormDialogFoot)\b/;

/**
 * Overlays that are not a form, a choice or a confirm, each with why it
 * keeps a frame of its own. Adding to this list is a decision: say why.
 */
const NOT_FORMS: Record<string, string> = {
    // The frames themselves.
    "components/shared/form-sheet.tsx": "the one sheet",
    "components/shared/form-dialog.tsx": "the one dialog",
    "components/shared/confirm-dialog.tsx": "the one confirm",
    "components/shared/use-leave-guard.tsx":
        "the one leave guard: Stay, Leave, and Save and leave",
    // Read-only quick looks, with their own header as their design draws.
    "components/shared/quick-look.tsx": "a read-only quick look",
    "components/stores/catalogue/quick-look.tsx": "a read-only quick look",
    "components/bookings/calendar/booking-quick-look.tsx":
        "a read-only quick look with its own actions",
    "components/commerce/product-page/variant-drawer.tsx":
        "a read-only quick look",
    "components/calendar/day-sheet.tsx": "a read-only list of a day",
    // Hours and time off's sheets (U17, DEC-170): what they hold saves as
    // it is changed, with Undo, so there is no Save or Cancel, only Done.
    "components/bookings/availability/hours-panel.tsx":
        "Hours and time off's frame: each control saves as it changes, Done closes",
    "components/qr/qr-button.tsx": "a code to scan, download and copy",
    // Navigation and pickers.
    "components/shared/tab-bar-sheet.tsx": "the phone's menu",
    "components/sites/editor/editor-sheet.tsx": "the site editor's panels",
    "components/sites/add-section-dialog.tsx":
        "a picker: choosing a section adds it",
    "components/commerce/orders/order-filters-sheet.tsx":
        "filters, applied as they are chosen",
    // Header C's three pickers (bookings U2): a sheet from the foot of a
    // phone, a popover under its button on the desk; choosing goes there.
    "components/bookings/calendar/header/header-overlay.tsx":
        "header C's frame: a phone sheet or a desk popover, choosing goes there",
    "components/bookings/calendar/header/date-sheet.tsx":
        "a picker: a day or a view, in header C's frame",
    "components/bookings/calendar/header/people-sheet.tsx":
        "a picker: whose bookings, in header C's frame",
    "components/bookings/calendar/header/options-sheet.tsx":
        "the view's options, each kept as it is chosen, in header C's frame",
    // Notices and flows with their own states.
    "components/billing/plan-refusal.tsx":
        "a notice with the way up, not a form",
    "components/settings/plan-billing/change-plan-dialog.tsx":
        "a payment flow with its own waiting states",
    "components/commerce/orders/order-row-menu.tsx":
        "a payment link shown once, to copy",
};

/** Files that only pass a frame's name or type along. */
const PASS_THROUGH = [
    "components/sites/settings/settings-sheet.tsx",
    "components/sites/test-releases/test-release-sheets.tsx",
    "components/commerce/product-page/sheets/stock-sheet-row.tsx",
];

describe("every sheet and dialog file draws the one frame", () => {
    const named = FILES.filter((f) => /-(sheet|dialog)\.tsx$/.test(f));

    it("finds them", () => {
        expect(named.length).toBeGreaterThan(40);
    });

    it.each(named.map((f) => [rel(f)]))("%s", (file) => {
        if (file in NOT_FORMS) return;
        const src = read(path.join(APP, file));
        expect(FRAMES.test(src), `${file} draws a frame of its own`).toBe(true);
    });

    it("no file named a sheet holds a dialog, or the other way about", () => {
        const wrong: string[] = [];
        for (const f of named) {
            const file = rel(f);
            if (file in NOT_FORMS) continue;
            const src = read(f);
            if (file.endsWith("-sheet.tsx") && /<FormDialog\b/.test(src)) {
                if (!/<(FormSheet|QuickSheet|OrderSheet)\b/.test(src)) {
                    wrong.push(file);
                }
            }
        }
        expect(wrong).toEqual([]);
    });
});

describe("no frame is drawn by hand", () => {
    it("only the confirm and the leave guard write an AlertDialog", () => {
        const users = FILES.filter((f) =>
            read(f).includes("@saroh/ui/alert-dialog"),
        ).map(rel);
        expect(users.sort()).toEqual([
            "components/shared/confirm-dialog.tsx",
            "components/shared/use-leave-guard.tsx",
        ]);
    });

    it("a raw SheetContent or DialogContent is on the list of things that are not forms", () => {
        const raw = FILES.filter((f) =>
            /<(SheetContent|DialogContent|Dialog\.Content)\b/.test(read(f)),
        ).map(rel);
        const unlisted = raw.filter((f) => !(f in NOT_FORMS));
        expect(unlisted).toEqual([]);
    });

    it("the list names only files that exist", () => {
        for (const file of [...Object.keys(NOT_FORMS), ...PASS_THROUGH]) {
            expect(existsSync(path.join(APP, file)), file).toBe(true);
        }
    });

    it("the old frames and prompts are gone", () => {
        for (const gone of [
            "components/shared/settings-sheet-frame.tsx",
            "components/shared/action-sheet.tsx",
            "components/bookings/calendar/use-held.ts",
            "components/commerce/product-settings/name-dialog.tsx",
        ]) {
            expect(existsSync(path.join(APP, gone)), gone).toBe(false);
        }
        const asking = FILES.filter((f) =>
            read(f).includes("You have changes that are not saved"),
        ).map(rel);
        expect(asking).toEqual([]);
    });

    it("no caller patches a footer's gap, or words its own way out of a confirm", () => {
        const patched = FILES.filter((f) =>
            /<(Dialog|Sheet|AlertDialog)Footer className="[^"]*(space-x|gap-)/.test(
                read(f),
            ),
        ).map(rel);
        expect(patched).toEqual([]);
        const cancels: string[] = [];
        for (const f of FILES) {
            const calls = read(f).match(/<ConfirmDialog\b[\s\S]*?\/>/g) ?? [];
            if (calls.some((call) => call.includes("cancelLabel="))) {
                cancels.push(rel(f));
            }
        }
        expect(cancels).toEqual([]);
    });
});

describe("one Undo window", () => {
    it("no screen keeps a duration or a timer of its own", () => {
        const own: string[] = [];
        for (const f of FILES) {
            const src = read(f);
            if (/const (UNDO_MS|HOLD_MS)\s*=/.test(src)) own.push(rel(f));
            if (/showUndo\([\s\S]{0,400}?duration:\s*\d/.test(src)) {
                own.push(rel(f));
            }
        }
        expect(own).toEqual([]);
    });
});

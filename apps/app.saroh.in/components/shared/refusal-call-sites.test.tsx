/**
 * A save's sentence under a form is `Refusal`, never a red line drawn by
 * hand (UX audit, 10 Oct 2026). A role's refusal used to be printed in the
 * error's red under a field, which tells someone to try again at a thing
 * that will only be refused again.
 *
 * What stays a hand-written `role="alert"` line is a field's own problem
 * (validation, and an API sentence that names the field) and a part of a
 * page that couldn't be read. This file pins the forms that were moved and
 * fails a new one that prints a write's result by hand.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { roleDeniedSentence } from "@/lib/api/role-denied";

vi.mock("@/components/sites/media-picker", () => ({
    useImageUpload: () => ({
        upload: vi.fn(),
        busy: false,
        error: upload.error,
    }),
}));

/** What the upload last said, as each test sets it. */
const upload = vi.hoisted(() => ({ error: null as string | null }));

import { LogoUpload } from "./logo-upload";

const APP = join(__dirname, "..", "..");

/** The forms whose save line was drawn by hand, now `Refusal`. */
const MOVED = [
    "components/bookings/availability/add-person-dialog.tsx",
    "components/bookings/calendar/gap-form.tsx",
    "components/bookings/pay-link-panel.tsx",
    "components/bookings/take-payment.tsx",
    "components/class-packs/pack-detail/extend-dialog.tsx",
    "components/customers/detail/merge-dialog.tsx",
    "components/customers/detail/remove-details-dialog.tsx",
    "components/organizations/business-logo-sheet.tsx",
    "components/organizations/social-links-sheet.tsx",
    "components/shared/logo-upload.tsx",
    "components/sites/add-domain-dialog.tsx",
    "components/sites/media-picker.tsx",
    "components/sites/settings/site-address-sheet.tsx",
    "components/stores/location-address-fields.tsx",
    "components/stores/location-details-sheet.tsx",
    "components/stores/place-sheets.tsx",
];

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
    });
}

/**
 * The names a write's sentence is kept under in these forms. A field's own
 * problem is `problem`, `missing` or the field's name, and is not here.
 */
const SAVE_WORDS = /^(refusal|failure|uploadError|res\.error|result\.error)$/;

/** Each hand-written alert line in a file, with the one value it prints. */
function handAlerts(source: string): string[] {
    const printed: string[] = [];
    const alert =
        /<(p|span|div)\b[^>]*role="alert"[^>]*>\s*\{([^{}]+)\}\s*<\/\1>/g;
    for (let m = alert.exec(source); m; m = alert.exec(source)) {
        printed.push(m[2].trim());
    }
    return printed;
}

describe("the forms moved onto Refusal", () => {
    it.each(MOVED)("%s says its save's sentence with Refusal", (file) => {
        const source = readFileSync(join(APP, file), "utf8");
        expect(source).toContain("<Refusal");
        expect(source).toContain('from "@/components/shared/refusal"');
    });

    it("no form prints a write's refusal as a hand-written alert line", () => {
        const found = [
            ...sources(join(APP, "components")),
            ...sources(join(APP, "app")),
        ].flatMap((path) =>
            handAlerts(readFileSync(path, "utf8"))
                .filter((value) => SAVE_WORDS.test(value))
                .map((value) => `${relative(APP, path)}: {${value}}`),
        );
        expect(found).toEqual([]);
    });
});

describe("a logo upload that didn't go through", () => {
    const html = (error: string | null) => {
        upload.error = error;
        return renderToStaticMarkup(
            <LogoUpload value={null} onChange={() => undefined} name="Rye" />,
        ).replace(/&#x27;/g, "'");
    };

    it("says a refusal by role as a note, never the red alert", () => {
        const refused = roleDeniedSentence("media:write");
        const markup = html(refused);
        expect(markup).toContain(refused);
        expect(markup).toContain('role="note"');
        expect(markup).not.toContain('role="alert"');
    });

    it("says anything else as the error notice", () => {
        const markup = html("The upload did not go through. Try again.");
        expect(markup).toContain('role="alert"');
        expect(markup).toContain("The upload did not go through. Try again.");
    });

    it("says nothing, and shows its hint, when it went through", () => {
        const markup = html(null);
        expect(markup).not.toContain('role="alert"');
        expect(markup).not.toContain('role="note"');
    });
});

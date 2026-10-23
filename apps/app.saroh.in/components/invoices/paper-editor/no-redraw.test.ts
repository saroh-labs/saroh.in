/**
 * The invoice editor is never drawn again by a save made from it (review
 * #15, 20 Oct 2026). Once a new invoice has its own address (`/<id>/edit`)
 * while the `/new` tree is drawn, any revalidation makes the router read
 * `/edit` and remount the form: the Style sheet closes and the last 800 ms
 * of typing are lost.
 *
 * So the server actions the editor calls after its first save revalidate
 * nothing, and the editor's files never import the revalidating settings
 * saves. A scan of the source, so a later edit that adds a
 * `revalidatePath` to one of them fails here, not in a merchant's hands.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(APP, file), "utf8");

/** One exported function's text, up to the next top-level declaration. */
function body(file: string, name: string): string {
    const src = read(file);
    const start = src.indexOf(`export async function ${name}(`);
    if (start < 0) throw new Error(`${name} isn't in ${file}`);
    const rest = src.slice(start + 1);
    const end = rest.search(/\n(?:export |\/\*\*|\/\*|function |const )/);
    return end < 0 ? rest : rest.slice(0, end);
}

const QUIET: [file: string, name: string][] = [
    ["lib/invoices/actions.ts", "updateInvoice"],
    [
        "lib/organizations/settings-actions.ts",
        "saveOrganizationSettingsInPlace",
    ],
    ["lib/organizations/settings-actions.ts", "saveBusinessLogoInPlace"],
    // Who on a new invoice adds a contact in place (UX-047).
    ["lib/contacts/create.ts", "createContact"],
];

const EDITOR = [
    "components/invoices/paper-editor/paper-editor.tsx",
    "components/invoices/paper-editor/style-panel.tsx",
    "components/invoices/paper-editor/part-popover.tsx",
    "components/invoices/paper-editor/add-line.tsx",
    "components/invoices/new-invoice/customer-block.tsx",
    "components/invoices/new-invoice/lines-table.tsx",
];

describe("the invoice editor is never redrawn by its own saves", () => {
    it.each(QUIET)("%s › %s revalidates nothing", (file, name) => {
        expect(body(file, name)).not.toMatch(/revalidate(Path|Tag)\(/);
    });

    it.each(EDITOR)("%s uses only the in-place settings saves", (file) => {
        const src = read(file);
        expect(src).not.toMatch(/\bsaveOrganizationSettings\b(?!InPlace)/);
        expect(src).not.toMatch(/\bsaveBusinessLogo\b(?!InPlace)/);
    });

    it("the editor's logo and How to pay us sheets save in place", () => {
        const src = read("components/invoices/paper-editor/paper-editor.tsx");
        for (const sheet of ["BusinessLogoSheet", "PayInstructionsSheet"]) {
            const at = src.indexOf(`<${sheet}`);
            expect(at).toBeGreaterThan(-1);
            const tag = src.slice(at, src.indexOf("/>", at));
            expect(tag).toMatch(/\bsave=\{save\w+InPlace\}/);
        }
    });
});

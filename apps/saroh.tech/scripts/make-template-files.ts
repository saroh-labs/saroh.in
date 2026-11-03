/**
 * The template pages' downloads, from each page's own data, into the
 * git-ignored public/templates. Runs before `next build`, and by hand with
 * `pnpm make:templates` when you want the buttons to work under `next dev`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { jsPDF } from "jspdf";

import { docx, xlsx } from "../lib/templates/office";
import { templatePages, templateView } from "../lib/templates/pages";
import { drawPdf } from "../lib/tools/pdf";

const out = join(
    fileURLToPath(new URL("..", import.meta.url)),
    "public/templates",
);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const page of templatePages) {
    const view = templateView(page);
    const name = join(out, page.key);
    writeFileSync(
        `${name}.pdf`,
        Buffer.from(drawPdf(jsPDF, view, page.paper).output("arraybuffer")),
    );
    writeFileSync(`${name}.docx`, docx(view, page.paper));
    writeFileSync(`${name}.xlsx`, xlsx(view));
}
console.log(`make-template-files: ${templatePages.length} pages, 3 files each`);

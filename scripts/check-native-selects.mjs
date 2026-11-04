// Every list on saroh.tech is the shadcn select (`SelectField`, on
// `OptionSelect` from `@saroh/ui`), never `<select>`, which draws the
// operating system's menu beside the product's fields (owner, 4 Nov 2026: "use
// the correct shadcn inputs we have").
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const app = join("apps", "saroh.tech");
const SKIP = /(^|\/)(node_modules|\.next|\.open-next|out|dist|\.turbo)(\/|$)/;

let checked = 0;
for (const f of readdirSync(join(root, app), { recursive: true })) {
    const file = join(app, String(f));
    if (SKIP.test(file) || !/\.(tsx|jsx)$/.test(file)) continue;
    if (/\.test\.(tsx|jsx)$/.test(file)) continue;
    checked += 1;
    readFileSync(join(root, file), "utf8")
        .split("\n")
        .forEach((line, i) => {
            const code = line.replace(/\/\/.*$/, "");
            if (/^\s*\*/.test(code)) return; // a doc comment's line
            if (/<select\b/.test(code)) {
                console.error(
                    `${file}:${i + 1}: a native select. Use SelectField from @/components/shared/field.`,
                );
                process.exitCode = 1;
            }
        });
}
if (!process.exitCode)
    console.log(`native-selects: ${checked} files, no native select`);

// Every date field is the shadcn date picker (`DateInput` / `DatePicker`
// from `@saroh/ui/date-picker`), never `<input type="date">`, which each
// browser draws its own way (owner, 19 Oct 2026: "replace the base date
// input from everywhere and use shadcn one").
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const NATIVE = /type=(?:"|\{["'`])(?:date|datetime-local|month|week)(?:"|["'`]\})/;
const SKIP = /(^|\/)(node_modules|\.next|dist|\.turbo)(\/|$)/;

let checked = 0;
for (const dir of ["apps", "packages"]) {
    for (const f of readdirSync(join(root, dir), { recursive: true })) {
        const file = join(dir, String(f));
        if (SKIP.test(file) || !/\.(tsx|jsx)$/.test(file)) continue;
        if (/\.test\.(tsx|jsx)$/.test(file)) continue;
        checked += 1;
        readFileSync(join(root, file), "utf8")
            .split("\n")
            .forEach((line, i) => {
                const code = line.replace(/\/\/.*$/, "");
                if (/^\s*\*/.test(code)) return; // a doc comment's line
                if (NATIVE.test(code)) {
                    console.error(
                        `${file}:${i + 1}: a native date input. Use DateInput from @saroh/ui/date-picker.`,
                    );
                    process.exitCode = 1;
                }
            });
    }
}
if (!process.exitCode) console.log(`date-inputs: ${checked} files, no native date input`);

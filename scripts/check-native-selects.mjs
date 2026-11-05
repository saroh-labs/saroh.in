// Every list on saroh.tech and in @saroh/marketing, which it's built from, is the
// shadcn select (`SelectField`, on `OptionSelect` from `@saroh/ui`), never
// `<select>`, which draws the operating system's menu beside the product's
// fields (owner, 4 Nov 2026: "use the correct shadcn inputs we have").
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const SCOPE = [
    join("apps", "saroh.tech"),
    join("packages", "marketing", "src"),
];
const SKIP = /(^|\/)(node_modules|\.next|\.open-next|out|dist|\.turbo)(\/|$)/;

let total = 0;
for (const dir of SCOPE) {
    let checked = 0;
    const files = existsSync(join(root, dir))
        ? readdirSync(join(root, dir), { recursive: true })
        : [];
    for (const f of files) {
        const file = join(dir, String(f));
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
    // A moved folder must not pass by scanning nothing.
    if (checked === 0) {
        console.error(`native-selects: nothing to check in ${dir}`);
        process.exitCode = 1;
    }
    total += checked;
}
if (!process.exitCode)
    console.log(`native-selects: ${total} files, no native select`);

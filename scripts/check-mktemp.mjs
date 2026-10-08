// Every `mktemp` in the repo's shell scripts that names a template gives it
// X's (a bare `mktemp` is fine on both).
// `mktemp -d -t prepush` works on macOS and fails on Linux ("too few X's"):
// prepush then reported every step FAILed without running one. It was fixed
// on 3 Oct and came back through a merge that kept the old line, so it is
// checked here, on CI's Linux, rather than remembered.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const files = [
    ...readdirSync(join(root, "scripts"), { recursive: true })
        .filter((f) => String(f).endsWith(".sh"))
        .map((f) => join("scripts", String(f))),
    ...readdirSync(join(root, ".husky"))
        .filter((f) => !f.startsWith("_"))
        .map((f) => join(".husky", f)),
];

let checked = 0;
for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    lines.forEach((line, i) => {
        if (line.trimStart().startsWith("#")) return;
        for (const call of line.matchAll(/mktemp\b[^)`;|&]*/g)) {
            checked += 1;
            if (/\s-\w*t\b/.test(call[0]) && !/XXX/.test(call[0])) {
                console.error(
                    `${file}:${i + 1}: mktemp -t without X's (fails on Linux): ${call[0].trim()}`,
                );
                process.exitCode = 1;
            }
        }
    });
}
if (!process.exitCode) console.log(`mktemp: ${checked} calls, none with -t and no X's`);

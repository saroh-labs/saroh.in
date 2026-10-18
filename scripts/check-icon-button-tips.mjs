// No `<Tip>` wrapped around an `<IconButton>` that still shows its own.
// IconButton turns its `label` into a tooltip, so a Tip around it drew two
// tooltips over each other (the products quick look's Previous / Next, 16 Oct).
// A Tip around one is fine only when the button sets `tooltip` itself: off
// where the Tip's words replace it (the theme toggle), or off while the Tip
// explains why it is disabled (the new order's + button).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "*.tsx"], {
    cwd: root,
    encoding: "utf8",
})
    .split("\n")
    .filter(
        (f) =>
            f &&
            !f.includes(".test.") &&
            (f.startsWith("apps/") || f.startsWith("packages/")),
    );

let found = 0;
for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const m of text.matchAll(
        /<Tip\b[^>]*>\s*<IconButton\b([\s\S]*?)(?:\n\s*\/>|^[^\n<]*\/>)/gm,
    )) {
        if (/\btooltip=\{/.test(m[1])) continue;
        const line = text.slice(0, m.index).split("\n").length;
        console.error(
            `${file}:${line}: <Tip> around an <IconButton> that has its own tooltip; drop the Tip or pass tooltip={false}`,
        );
        found += 1;
    }
}
if (found) process.exitCode = 1;
else console.log("icon-button-tips: no IconButton wrapped in a second tooltip");

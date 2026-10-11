// No tag is taken out of markup by one pattern replace with nothing.
// `html.replace(/<[^>]+>/g, "")` reads as fine and the code scanner refuses
// it (js/incomplete-multi-character-sanitization): `<scr<b>ipt>` is a tag
// again once the inner one is gone. It reached a pull request twice, in
// test helpers, because nothing local runs the scanner. So it is checked
// here: such a replace must sit in a loop that runs until nothing changes
// (`for (let before = ""; before !== out; )`), or put a space or a mark
// where the tag was.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const SKIP =
    /(^|\/)(node_modules|\.next|dist|\.turbo|\.open-next|coverage)(\/|$)/;
const files = ["apps", "packages", "e2e"].flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true })
        .map((f) => join(dir, String(f)))
        .filter((f) => /\.(ts|tsx|mts|mjs)$/.test(f) && !SKIP.test(f)),
);

// A pattern that opens with `<` and matches any run of characters, replaced
// by the empty string, before the pattern closes its first tag. A named tag with nothing open-ended (`<wbr\/?>`)
// cannot be put back together and is left alone.
const STRIP =
    /\.replace\(\s*\/<[^/>\n]*(\[\^|\[\\s\\S\])[^\n]*\/[a-z]*,\s*(""|''|``)\s*,?\s*\)/;

let found = 0;
for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    lines.forEach((line, i) => {
        if (!STRIP.test(line)) return;
        // In a run-until-stable loop: the three lines above say so.
        const above = lines.slice(Math.max(0, i - 3), i).join("\n");
        if (/before\s*!==/.test(above)) return;
        found += 1;
        console.error(
            `${file}:${i + 1}: a tag pattern replaced with nothing, once. Loop until nothing changes, or replace with a space.`,
        );
    });
}
if (found) process.exitCode = 1;
else console.log(`tag-strip: ${files.length} files, no one-pass tag strip`);

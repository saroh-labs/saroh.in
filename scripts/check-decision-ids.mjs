// Every decision in docs/architecture/DECISIONS.md has its own number, once.
// On 20 Oct a merge of the looks release wrote DEC-171, DEC-173 and DEC-174
// twice and stacked eleven copies of one Rules line (review #23): nobody
// could tell which copy was the decision. Fails listing each number written
// as a heading more than once.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Two different decisions took this number on 17 Oct and both are cited in
// code (DEC-163, Home's late orders and Admin Billing); renumbering either
// would break those citations, so this pair is allowed and no other.
const KNOWN = new Set(["DEC-163"]);

const file = join(import.meta.dirname, "..", "docs/architecture/DECISIONS.md");
const seen = new Map();
readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
        const id = line.match(/^#{1,6}\s+(DEC-\d+)\b/)?.[1];
        if (id) seen.set(id, [...(seen.get(id) ?? []), i + 1]);
    });
for (const [id, lines] of seen) {
    if (lines.length > 1 && !KNOWN.has(id)) {
        console.error(
            `${id} is written ${lines.length} times in DECISIONS.md (lines ${lines.join(", ")}): keep one, or give the new decision the next free number`,
        );
        process.exitCode = 1;
    }
}
if (!process.exitCode) console.log(`decision ids: ${seen.size} decisions, each once`);

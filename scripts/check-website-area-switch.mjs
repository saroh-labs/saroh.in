// The Website area has one switch, the api's WEBSITE_AREA (DEC-240): the app
// asks the api for it. An app copy (NEXT_PUBLIC_WEBSITE_AREA) was set apart
// from the api's on 20 Nov 2026, and the two disagreeing left posts stuck
// (21 Nov review, E2). So no code, config or test may bring it back.
import { execFileSync } from "node:child_process";

const name = ["NEXT_PUBLIC", "WEBSITE_AREA"].join("_");
let hits = "";
try {
    hits = execFileSync(
        "git",
        // Plans and prototypes are history; DECISIONS.md tells the story.
        [
            "grep",
            "-n",
            name,
            "--",
            ".",
            ":!docs",
            ":!scripts/check-website-area-switch.mjs",
        ],
        { encoding: "utf8" },
    );
} catch (error) {
    // git grep exits 1 when nothing matches.
    if (error.status !== 1) throw error;
}
if (hits.trim()) {
    console.error(
        `${name} is gone (DEC-240): read the api's switch through lib/sites/website-area-switch.ts.\n${hits}`,
    );
    process.exitCode = 1;
} else {
    console.log(`website-area switch: no ${name} anywhere`);
}

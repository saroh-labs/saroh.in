// Every model belongs to one business, directly or through a parent, or is
// listed in shared-data.json with its reason (DEC-204). So shared data stays
// small and known, and a new model can't quietly become shared.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const schema = readFileSync(
    join(root, "packages/database/prisma/schema.prisma"),
    "utf8",
);

export function sharedModels(text) {
    const models = new Map(
        [...text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => [
            m[1],
            m[2],
        ]),
    );
    const owned = new Set(["Organization"]);
    for (const [name, body] of models) {
        if (/^\s+organizationId\s/m.test(body)) owned.add(name);
    }
    // User is the one parent that says nothing about a business.
    for (let grew = true; grew;) {
        grew = false;
        for (const [name, body] of models) {
            if (owned.has(name) || name === "User") continue;
            const parents = [
                ...body.matchAll(/^\s+\w+\s+(\w+)\??\s+@relation/gm),
            ].map((m) => m[1]);
            if (parents.some((p) => owned.has(p))) {
                owned.add(name);
                grew = true;
            }
        }
    }
    return [...models.keys()].filter((name) => !owned.has(name));
}

// Self-check: owned, owned through a parent, and shared.
console.assert(
    sharedModels(
        "model A {\n  organizationId String\n}\nmodel B {\n  a A @relation(fields: [x])\n}\nmodel C {\n  id String\n}\n",
    ).join() === "C",
);

const groups = JSON.parse(
    readFileSync(join(root, "scripts/shared-data.json"), "utf8"),
);
const listed = new Set(
    Object.entries(groups)
        .filter(([key]) => key !== "_")
        .flatMap(([, models]) => Object.keys(models)),
);
const found = sharedModels(schema);
const unlisted = found.filter((m) => !listed.has(m));
const stale = [...listed].filter((m) => !found.includes(m));
for (const m of unlisted) {
    console.error(
        `${m} belongs to no business: give it organizationId, or list it in scripts/shared-data.json with why.`,
    );
}
for (const m of stale) {
    console.error(`${m} is in scripts/shared-data.json but isn't shared now.`);
}
if (unlisted.length || stale.length) process.exit(1);
console.log(`${found.length} shared models, all listed.`);

// The clone check on a fixture tree (DEC-195): a copied block fails until it is
// in the baseline; a third copy fails again; a removed copy passes and says the
// baseline can shrink. Run by `pnpm run check:dupes`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { meaningful } from "./check-dupes.mjs";

const SCRIPT = join(import.meta.dirname, "check-dupes.mjs");

const BLOCK = `
export function Price({ plan }) {
    const shown = plan.price.toFixed(0);
    const per = plan.per ?? "a month";
    const note = plan.note ?? "";
    const tone = plan.featured ? "ink" : "paper";
    const label = \`\${plan.name}: \${shown} \${per}\`;
    return { shown, per, note, tone, label };
}
`;

function tree() {
    const root = mkdtempSync(join(tmpdir(), "check-dupes-"));
    const put = (path, source) => {
        mkdirSync(join(root, dirname(path)), { recursive: true });
        writeFileSync(join(root, path), source);
    };
    mkdirSync(join(root, "scripts"));
    const run = (...args) =>
        spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], {
            encoding: "utf8",
        });
    return {
        root,
        put,
        run,
        done: () => rmSync(root, { recursive: true, force: true }),
    };
}

test("a copied block fails, passes once baselined, fails on a third copy, and says when it shrinks", () => {
    const t = tree();
    try {
        t.put("apps/saroh.in/components/a.tsx", `// one\n${BLOCK}`);
        t.put("packages/search-pages/src/b.tsx", `// two\n${BLOCK}`);
        t.put("apps/saroh.in/components/a.test.tsx", BLOCK); // tests are ignored

        let r = t.run();
        assert.equal(r.status, 1, r.stdout + r.stderr);
        assert.match(r.stderr, /New copy of 7 lines/);
        assert.match(r.stderr, /apps\/saroh\.in\/components\/a\.tsx:3-9/);
        assert.doesNotMatch(r.stderr, /a\.test\.tsx/);

        r = t.run("--update");
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /1 clone groups \(7 lines\)/);
        r = t.run();
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /none new/);

        t.put("apps/saroh.in/lib/c.ts", BLOCK);
        r = t.run();
        assert.equal(r.status, 1, "a third copy of a known block is growth");
        assert.match(r.stderr, /lib\/c\.ts/);

        t.put("apps/saroh.in/lib/c.ts", "export const c = 1;\n");
        t.put("packages/search-pages/src/b.tsx", "export const b = 1;\n");
        r = t.run();
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /you can shrink the baseline/);
    } finally {
        t.done();
    }
});

test("a block repeated inside one file, or shorter than six lines, is not a clone", () => {
    const t = tree();
    try {
        t.put(
            "apps/saroh.in/components/a.tsx",
            `${BLOCK}\n${BLOCK.replace("Price", "Price2")}`,
        );
        const five = BLOCK.split("\n").slice(0, 6).join("\n");
        t.put("apps/saroh.in/components/b.tsx", five);
        t.put("apps/saroh.in/components/c.tsx", five);
        const r = t.run();
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /0 clone groups/);
    } finally {
        t.done();
    }
});

test("whitespace, imports, comments and bracket-only lines don't count", () => {
    const kept = meaningful(
        'import { a } from "a";\n\n// note\n/* long\n note */\n  const   x = 1;\n  }\n</div>\n);\nreturn x,\n',
    ).map((l) => l.text);
    assert.deepEqual(kept, ["const x = 1", "return x"]);
});

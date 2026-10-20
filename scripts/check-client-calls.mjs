// A server component never calls a function from a "use client" module of
// @saroh/ui. On the server such an import is a client reference, not the
// function: calling it throws ("Attempted to call avatarInitials() from the
// server …") and the whole page answers its error state. Insights' What
// sells tab did exactly that (gate, 20 Oct 2026, DEV_LEARNINGS). Components
// (capitalised) may be rendered from the server; lower-case exports are
// functions, and their server-safe twins live in `@saroh/ui/lib/*`.
//
// Checked: every .tsx under apps/*/app and apps/*/components with no
// "use client" line that imports a lower-case name from a @saroh/ui
// component whose source is "use client", and calls it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const SKIP = /(^|\/)(node_modules|\.next|dist|\.turbo)(\/|$)/;
const CLIENT = /^\s*["']use client["'];?\s*$/m;
const IMPORT =
    /import\s*\{([^}]*)\}\s*from\s*["']@saroh\/ui\/([a-z0-9-]+)["']/g;

/** Whether `@saroh/ui/<sub>` resolves to a "use client" component file. */
const clientModule = new Map();
function isClientModule(sub) {
    if (!clientModule.has(sub)) {
        const file = join(root, "packages/ui/src/components/ui", `${sub}.tsx`);
        clientModule.set(
            sub,
            existsSync(file) && CLIENT.test(readFileSync(file, "utf8")),
        );
    }
    return clientModule.get(sub);
}

let checked = 0;
for (const app of readdirSync(join(root, "apps"))) {
    for (const part of ["app", "components"]) {
        const dir = join(root, "apps", app, part);
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir, { recursive: true })) {
            const rel = join("apps", app, part, String(f));
            if (SKIP.test(rel) || !rel.endsWith(".tsx")) continue;
            if (/\.test\.tsx$/.test(rel)) continue;
            const src = readFileSync(join(root, rel), "utf8");
            if (CLIENT.test(src)) continue;
            checked += 1;
            for (const m of src.matchAll(IMPORT)) {
                if (!isClientModule(m[2])) continue;
                const names = m[1]
                    .split(",")
                    .map((n) => n.replace(/^\s*type\s+/, "").trim())
                    .map((n) => n.split(/\s+as\s+/).pop()?.trim() ?? "")
                    .filter((n) => /^[a-z]/.test(n));
                for (const name of names) {
                    if (!new RegExp(`\\b${name}\\s*\\(`).test(src)) continue;
                    console.error(
                        `${rel}: calls ${name}() from "use client" @saroh/ui/${m[2]} in a server component. Use its twin in @saroh/ui/lib/*, or the app's lib/.`,
                    );
                    process.exitCode = 1;
                }
            }
        }
    }
}
if (!process.exitCode)
    console.log(
        `client-calls: ${checked} server .tsx files, none calls a client function`,
    );

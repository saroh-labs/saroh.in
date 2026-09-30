/**
 * Every state-changing `/public/*` route, read from the controllers' source
 * (DEC-071, KTD-8). `test-host-routes.spec.ts` uses it to make each public
 * write choose, on the record, whether a test release may reach it.
 *
 * A source scan, as `module-annotations.spec.ts` does, rather than importing
 * every controller: the question is "what did we write", and importing
 * thirty controllers would drag in every service, Prisma and the env with
 * them. Test-only; nothing at runtime reads it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface PublicWriteRoute {
    /** `POST public/sites/:siteId/checkout` */
    key: string;
    /** The controller file, relative to the scanned directory. */
    file: string;
    /** Carries `@AllowOnTestRelease()` on the handler or its class. */
    allowed: boolean;
}

const WRITE_VERBS = ["Post", "Put", "Patch", "Delete", "All"] as const;

const ROUTE_RE = new RegExp(
    String.raw`@(${WRITE_VERBS.join("|")})\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)`,
    "g",
);

const ALLOW_RE = /@AllowOnTestRelease\(\s*\)/;

/** Source without block comments or whole-line `//` comments. */
function stripComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => (line.trim().startsWith("//") ? "" : line))
        .join("\n");
}

/** A capture group, which is undefined at runtime when it did not take part. */
function group(match: RegExpMatchArray, ...indexes: number[]): string {
    for (const i of indexes) {
        const value = match[i] as string | undefined;
        if (value !== undefined) return value;
    }
    return "";
}

function joinPath(base: string, sub: string): string {
    return [base, sub]
        .flatMap((part) => part.split("/"))
        .filter(Boolean)
        .join("/");
}

/**
 * The write routes one controller file declares, public or not. Throws on a
 * `@Controller(...)` whose path is not a plain string, so a route can never
 * hide from the scan behind a computed path.
 */
export function writeRoutesIn(
    source: string,
    file: string,
): PublicWriteRoute[] {
    const code = stripComments(source);
    const routes: PublicWriteRoute[] = [];
    const controllerRe = /@Controller\(([^)]*)\)/g;
    const starts: { index: number; base: string }[] = [];
    for (const match of code.matchAll(controllerRe)) {
        const arg = group(match, 1).trim();
        const literal = /^(?:"([^"]*)"|'([^']*)')?$/.exec(arg);
        if (!literal) {
            throw new Error(
                `${file}: @Controller(${arg}) is not a plain string path`,
            );
        }
        starts.push({
            index: match.index,
            base: group(literal, 1, 2),
        });
    }

    starts.forEach(({ index, base }, i) => {
        const end = starts[i + 1]?.index ?? code.length;
        // Class decorators sit between the last top-level `}` and `class`.
        const before = code.lastIndexOf("\n}", index);
        const classAt = code.indexOf("class ", index);
        const classDecorators = code.slice(
            before === -1 ? 0 : before,
            classAt === -1 ? index : classAt,
        );
        const classAllowed = ALLOW_RE.test(classDecorators);
        const body = code.slice(index, end);
        // Where each member (constructor, handler) is declared.
        const signatures = [
            ...body.matchAll(/\n {4}(?:async\s+)?[A-Za-z_$][\w$]*\s*\(/g),
        ].map((match) => match.index);

        for (const route of body.matchAll(ROUTE_RE)) {
            const at = route.index;
            // The handler's decorators run from the previous member (its
            // signature, or the `}` closing its body) to its own signature.
            const previous = signatures.filter((s) => s < at).pop() ?? 0;
            const from = Math.max(previous, body.lastIndexOf("\n    }", at));
            const to = signatures.find((s) => s > at) ?? body.length;
            const decorators = body.slice(Math.max(from, 0), to);
            const verb = group(route, 1).toUpperCase();
            const sub = group(route, 2, 3);
            routes.push({
                key: `${verb} ${joinPath(base, sub)}`,
                file,
                allowed: classAllowed || ALLOW_RE.test(decorators),
            });
        }
    });
    return routes;
}

function controllerFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) controllerFiles(path, out);
        else if (name.endsWith(".controller.ts")) out.push(path);
    }
    return out;
}

/** Every write route under `public/` in the controllers below `dir`. */
export function publicWriteRoutes(dir: string): PublicWriteRoute[] {
    return controllerFiles(dir)
        .flatMap((path) =>
            writeRoutesIn(readFileSync(path, "utf8"), relative(dir, path)),
        )
        .filter((route) => route.key.split(" ")[1]?.startsWith("public/"))
        .sort((a, b) => a.key.localeCompare(b.key));
}

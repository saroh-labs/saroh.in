/**
 * Writes the public OpenAPI documents the docs site serves and renders
 * (plan 2026-11-10-001, U16): `v1.json` and `storefront.json`, built from
 * the contract's routes. `--check` writes nothing and fails when the
 * committed files are out of date with the contract (`pnpm check:openapi`).
 *
 *   pnpm openapi         # write, from the repo root
 *   pnpm check:openapi   # compare
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Source, not dist, so the check needs no build first.
import { hostsFor, parseEdition, urlOf } from "../../edition/src/index";
import type { Surface } from "../src/index";
import { buildOpenApi } from "../src/index";

const check = process.argv.includes("--check");

// The committed files, and `--check`, are India's production. A docs deploy
// (`pnpm cf:build` in apps/docs.saroh.in) writes its own edition's and
// environment's copy in its own checkout first, from the settings its
// wrangler.jsonc gives the build: NEXT_PUBLIC_EDITION, and VERCEL_ENV
// "preview" for development. The docs read every host from these files.
const EDITION = check ? "INDIA" : parseEdition(process.env.NEXT_PUBLIC_EDITION);
const ENVIRONMENT =
    !check && process.env.VERCEL_ENV === "preview"
        ? "development"
        : "production";

const OUT_DIR = join(__dirname, "../../../apps/docs.saroh.in/public/api");

const BASE_PATH: Record<Surface, string> = {
    v1: "/v1",
    storefront: "/v1/storefront",
};

function documentFor(surface: Surface): string {
    const api = urlOf(hostsFor(EDITION, ENVIRONMENT).api);
    const { openapi, info, ...rest } = buildOpenApi(surface);
    const doc = {
        openapi,
        info,
        servers: [{ url: `${api}${BASE_PATH[surface]}` }],
        ...rest,
    };
    return `${JSON.stringify(doc, null, 2)}\n`;
}

const stale: string[] = [];
for (const surface of ["v1", "storefront"] as const) {
    const file = join(OUT_DIR, `${surface}.json`);
    const next = documentFor(surface);
    if (check) {
        let current = "";
        try {
            current = readFileSync(file, "utf8");
        } catch {
            // Missing counts as stale.
        }
        if (current !== next) stale.push(file);
    } else {
        writeFileSync(file, next);
        console.log(`wrote ${file}`);
    }
}
if (stale.length) {
    console.error(
        `The OpenAPI documents are out of date with @saroh/api-contract:\n  ${stale.join("\n  ")}\nRun: pnpm openapi`,
    );
    process.exit(1);
}
if (check) console.log("openapi: documents match the contract");

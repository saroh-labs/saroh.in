import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { allToolPages } from "./load";

/**
 * The email gate's email names the tool from the API's own list
 * (`apps/api.saroh.in/src/modules/tools/tool-names.ts`), never from the
 * request, and refuses a slug the list lacks. So every tool page here must
 * be on it, under the name the page shows. The API file is read as text:
 * the package imports no workspace code.
 */
const API_NAMES: Record<string, string> = Object.fromEntries(
    [
        ...readFileSync(
            path.resolve(
                __dirname,
                "../../../apps/api.saroh.in/src/modules/tools/tool-names.ts",
            ),
            "utf8",
        ).matchAll(/^\s*"([a-z0-9-]+)":\s*"([^"]+)",$/gm),
    ].map((m) => [m[1] ?? "", m[2] ?? ""]),
);

describe("the API's tool names", () => {
    it("reads the list", () => {
        expect(API_NAMES["qr-code-maker"]).toBe("QR code maker");
    });

    it.each(allToolPages().map((p) => [p.slug, p.name]))(
        "names %s as its page does",
        (slug, name) => {
            expect(API_NAMES[slug]).toBe(name);
        },
    );
});

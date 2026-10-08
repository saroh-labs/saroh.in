import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { TemplateShot } from "./template-shots";
import { TEMPLATE_SHOTS } from "./template-shots";
import { galleryTemplates } from "./templates";

/**
 * The gallery's captured renders (industry templates U14): every shot the
 * generated list names is a file under `public/`, at twice its stated CSS
 * size, of a gallery template's page — so a stale list can never put a
 * broken image on `/templates`.
 */
const PUBLIC = path.resolve(__dirname, "..", "public");

/** A WebP's pixel size, from its VP8/VP8L/VP8X header. */
function webpSize(file: string): { width: number; height: number } {
    const b = fs.readFileSync(file);
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") {
        return {
            width: 1 + b.readUIntLE(24, 3),
            height: 1 + b.readUIntLE(27, 3),
        };
    }
    if (kind === "VP8L") {
        const bits = b.readUInt32LE(21);
        return {
            width: 1 + (bits & 0x3fff),
            height: 1 + ((bits >> 14) & 0x3fff),
        };
    }
    return {
        width: b.readUInt16LE(26) & 0x3fff,
        height: b.readUInt16LE(28) & 0x3fff,
    };
}

describe("TEMPLATE_SHOTS", () => {
    const entries = Object.entries(TEMPLATE_SHOTS).flatMap(([slug, pages]) =>
        Object.entries(pages ?? {}).flatMap(([page, devices]) =>
            Object.entries(devices ?? {}).map(
                ([device, shot]) => [slug, page, device, shot] as const,
            ),
        ),
    );

    it.each(entries)(
        "%s %s %s is on disk at 2×",
        (
            slug: string,
            page: string,
            _device: string,
            shot: TemplateShot | undefined,
        ) => {
            if (!shot) return;
            const template = galleryTemplates().find((t) => t.slug === slug);
            expect(template, `${slug} is not a gallery template`).toBeDefined();
            expect(template?.pages.some((p) => p.path === page)).toBe(true);
            const file = path.join(PUBLIC, shot.src);
            expect(fs.existsSync(file), shot.src).toBe(true);
            expect(webpSize(file)).toEqual({
                width: shot.width * 2,
                height: shot.height * 2,
            });
        },
    );
});

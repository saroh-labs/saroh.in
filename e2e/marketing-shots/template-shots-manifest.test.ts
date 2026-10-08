/**
 * The template captures' manifests (U14) are the same text for the same
 * files, whatever order they were found in, and in the shape prettier
 * leaves them, so a re-run changes nothing it did not capture.
 *
 *   pnpm --filter @saroh/e2e test:shots
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

import type {
    CapturedShot,
    CapturedThumbnail,
} from "./template-shots-manifest";
import {
    templateShotsSource,
    templateThumbnailsSource,
} from "./template-shots-manifest";

const shot = (
    slug: string,
    p: string,
    device: "desktop" | "phone",
): CapturedShot => ({
    slug,
    path: p,
    device,
    src: `/templates/${slug}/${p === "/" ? "home" : p.slice(1)}-${device}.webp`,
    width: device === "desktop" ? 1440 : 390,
    height: device === "desktop" ? 900 : 844,
});

const SHOTS = [
    shot("gym", "/timetable", "phone"),
    shot("bakery", "/", "phone"),
    shot("gym", "/", "desktop"),
    shot("gym", "/timetable", "desktop"),
    shot("bakery", "/", "desktop"),
    shot("gym", "/", "phone"),
];

const THUMBS: CapturedThumbnail[] = [
    { id: "gym", src: "/templates/gym.webp", width: 360, height: 225 },
    { id: "bakery", src: "/templates/bakery.webp", width: 360, height: 225 },
];

void test("the gallery's list is the same whatever order the files came in", () => {
    const once = templateShotsSource(SHOTS);
    assert.equal(templateShotsSource([...SHOTS].reverse()), once);
    // Templates by slug, home first, desktop before phone.
    assert.ok(once.indexOf("bakery:") < once.indexOf("gym:"));
    assert.ok(once.indexOf('"/":') < once.indexOf('"/timetable":'));
    const gym = once.slice(once.indexOf("gym:"));
    assert.ok(gym.indexOf("desktop:") < gym.indexOf("phone:"));
});

void test("the picker's list is the same whatever order the files came in", () => {
    assert.equal(
        templateThumbnailsSource([...THUMBS].reverse()),
        templateThumbnailsSource(THUMBS),
    );
});

void test("with nothing captured, both lists are empty and still valid", () => {
    assert.match(templateShotsSource([]), /> = \{\};/);
    assert.match(templateThumbnailsSource([]), /> = \{\};/);
});

void test("both lists are as prettier writes them", () => {
    const root = path.resolve(__dirname, "..", "..");
    const prettier = path.join(root, "node_modules/.bin/prettier");
    for (const [source, file] of [
        [templateShotsSource(SHOTS), "apps/saroh.in/content/template-shots.ts"],
        [
            templateThumbnailsSource(THUMBS),
            "apps/app.saroh.in/lib/sites/template-thumbnails.ts",
        ],
    ] as const) {
        const formatted = execFileSync(
            prettier,
            ["--stdin-filepath", path.join(root, file)],
            { input: source, encoding: "utf8" },
        );
        assert.equal(source, formatted, file);
    }
});

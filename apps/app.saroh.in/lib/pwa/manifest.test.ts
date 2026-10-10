import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

import { APP_MANIFEST, NIGHT, PAPER } from "./manifest";

const APP = path.resolve(__dirname, "..", "..");

/** `40 31% 94%` (an HSL token) as `#F5F2EC`. */
function hex(token: string): string {
    const [h = 0, s = 0, l = 0] = token
        .split(/\s+/)
        .map((part) => Number.parseFloat(part));
    const sat = s / 100;
    const light = l / 100;
    const a = sat * Math.min(light, 1 - light);
    const channel = (n: number) => {
        const k = (n + h / 30) % 12;
        const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(value * 255)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

/** The same colour, to within two steps a channel. */
function near(a: string, b: string): boolean {
    const channels = (c: string) =>
        [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
    const [x, y] = [channels(a), channels(b)];
    return x.every((v, i) => Math.abs(v - (y[i] ?? Number.NaN)) <= 2);
}

describe("the web app manifest", () => {
    it("is what the route serves", () => {
        expect(manifest()).toBe(APP_MANIFEST);
    });

    it("installs as Saroh, in its own window, starting on Home", () => {
        expect(APP_MANIFEST).toMatchObject({
            name: "Saroh",
            short_name: "Saroh",
            start_url: "/",
            display: "standalone",
        });
    });

    it("takes its colours from the product's ground, light and dark", () => {
        const css = readFileSync(
            path.resolve(APP, "../../packages/ui/src/globals.css"),
            "utf8",
        );
        const token = /--background:\s*([\d.]+ [\d.]+% [\d.]+%)/g;
        const grounds: string[] = [];
        for (let m = token.exec(css); m; m = token.exec(css)) {
            grounds.push(hex(m[1]));
        }
        // The first two are the default skin's, light then dark. A token
        // is HSL in whole numbers, so a channel may sit one step off the
        // hex the brand file names.
        expect(near(grounds[0] ?? "", PAPER)).toBe(true);
        expect(near(grounds[1] ?? "", NIGHT)).toBe(true);
        expect(APP_MANIFEST.background_color).toBe(PAPER);
        expect(APP_MANIFEST.theme_color).toBe(PAPER);
    });

    it("names only icons the app ships, with a 192 and a 512 to install by", () => {
        const icons = APP_MANIFEST.icons ?? [];
        expect(icons.map((i) => i.sizes)).toEqual(
            expect.arrayContaining(["192x192", "512x512"]),
        );
        for (const icon of icons) {
            const file = icon.src.replace(/^\//, "");
            // `app/icon.svg` and `app/apple-icon.png` are served at the root
            // by Next's file convention; the rest are in `public/`.
            expect(
                existsSync(path.join(APP, "public", file)) ||
                    existsSync(path.join(APP, "app", file)),
                `${icon.src} isn't shipped`,
            ).toBe(true);
        }
    });

    it("says nothing a merchant shouldn't read", () => {
        const said = `${APP_MANIFEST.name} ${APP_MANIFEST.description}`;
        expect(said).not.toMatch(/[—;]/);
    });

    it("no service worker ships with it", () => {
        expect(existsSync(path.join(APP, "public", "sw.js"))).toBe(false);
        expect(existsSync(path.join(APP, "public", "service-worker.js"))).toBe(
            false,
        );
    });

    it("the root layout carries the tags iOS reads, and the browser's colour", () => {
        const layout = readFileSync(
            path.join(APP, "app", "layout.tsx"),
            "utf8",
        );
        expect(layout).toMatch(/appleWebApp:\s*\{[^}]*capable: true/);
        expect(layout).toMatch(/title: "Saroh"/);
        expect(layout).toMatch(/export const viewport: Viewport/);
        expect(layout).toMatch(/themeColor/);
    });
});

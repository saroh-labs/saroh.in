import { afterEach, describe, expect, it, vi } from "vitest";

import TemplateImage from "./[slug]/opengraph-image";
import GalleryImage from "./opengraph-image";

/**
 * The gallery's and a template's share cards follow their pages (DEC-135):
 * a 404 while the gallery's switch is off or its day hasn't come, the card
 * once it is shown.
 */
const mocked = vi.hoisted(() => {
    const env: Record<string, string | undefined> = {};
    return { env };
});
vi.mock("@/env", () => mocked);
vi.mock("@/lib/og-card", () => ({
    OG_SIZE: { width: 1200, height: 630 },
    OG_CONTENT_TYPE: "image/png",
    ogCard: (card: { title: string }) =>
        new Response(card.title, { status: 200 }),
}));

const AFTER = "2026-10-20T06:00:00Z";
const gym = { params: Promise.resolve({ slug: "gym" }) };

function at(iso: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
}

afterEach(() => {
    vi.useRealTimers();
    mocked.env = {};
});

describe("the templates' share cards", () => {
    it("are a 404 with the switch unset or off, whatever the date", async () => {
        at(AFTER);
        expect(GalleryImage().status).toBe(404);
        expect((await TemplateImage(gym)).status).toBe(404);
        mocked.env = { NEXT_PUBLIC_TEMPLATES: "off", RESOURCES_PREVIEW: "1" };
        expect(GalleryImage().status).toBe(404);
        expect((await TemplateImage(gym)).status).toBe(404);
    });

    it("are a 404 before the gallery's day, switch on", async () => {
        mocked.env = { NEXT_PUBLIC_TEMPLATES: "on" };
        at("2026-10-16T18:29:00Z");
        expect(GalleryImage().status).toBe(404);
        expect((await TemplateImage(gym)).status).toBe(404);
    });

    it("are drawn once the gallery is shown", async () => {
        mocked.env = { NEXT_PUBLIC_TEMPLATES: "on" };
        at(AFTER);
        expect(GalleryImage().status).toBe(200);
        const card = await TemplateImage(gym);
        expect(card.status).toBe(200);
        expect(await card.text()).toMatch(/^Gym: /);
    });
});

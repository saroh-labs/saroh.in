// @covers site:/ site:/preview pkg:site-blocks api:sites
import { expect, test } from "@playwright/test";

import { northwind } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";

/**
 * Photos sized for the screen (#1043), as markup.
 *
 * The browser stack runs `next start` with no Worker, so nothing is resized
 * here and `siteImage()` keeps each photo's own `src` (no
 * `NEXT_PUBLIC_SITE_MEDIA_URL`). What this proves is what every build owes a
 * phone whatever the Worker does: the first hero keeps its room (width and
 * height, so nothing shifts as it arrives), is fetched first, and is
 * preloaded from the head. Where a `srcset` is drawn, each of its versions
 * is a step of the ladder through `/_img/…`, never wider than the photo.
 * The route itself is `apps/saroh.app/lib/images/resize.test.ts`.
 *
 * Northwind's seeded home has no hero photo, so this gives its DRAFT one
 * and reads it through a preview link: the live site never changes. The
 * draft is Northwind's own, which other specs open, so this runs on its own
 * (`@serial`) and puts the draft back.
 */

interface DraftSection {
    type: string;
    contractVersion: number;
    content: Record<string, unknown>;
    hidden?: boolean;
    key?: string;
}

const LADDER = [320, 480, 780, 1200, 1600, 1920];
const PHOTO = {
    src: "https://images.example.com/e2e/northwind-hero.jpg",
    alt: "Cartons stacked in the Peenya warehouse",
    width: 1600,
    height: 1000,
};

test("@serial the first hero photo keeps its room, is fetched first and is preloaded", async ({
    page,
    context,
}) => {
    await useSession(page);
    const nw = northwind(page.request);
    const sites =
        await nw.get<{ id: string; subdomain: string | null }[]>("/sites");
    const siteId = sites.find((s) => s.subdomain === "northwind")?.id ?? "";
    expect(siteId, "Northwind has its site at northwind").toBeTruthy();
    const site = await nw.get<{ pages: { id: string; path: string }[] }>(
        `/sites/${siteId}`,
    );
    const home = site.pages.find((p) => p.path === "/");
    expect(home, "Northwind's site has a home page").toBeTruthy();
    const draftPath = `/sites/${siteId}/pages/${home?.id ?? ""}/draft`;

    const before = await nw.get<{
        revision: number;
        sections: DraftSection[];
    }>(draftPath);
    const asSent = (s: DraftSection): DraftSection => ({
        type: s.type,
        contractVersion: s.contractVersion,
        content: s.content,
        ...(s.hidden === undefined ? {} : { hidden: s.hidden }),
        ...(s.key ? { key: s.key } : {}),
    });
    const heroAt = before.sections.findIndex((s) => s.type === "hero");
    expect(heroAt, "Northwind's home opens on a hero").toBe(0);

    let linkId: string | null = null;
    try {
        await nw.put(`${draftPath}/sections`, {
            revision: before.revision,
            sections: before.sections.map((s, i) =>
                i === heroAt
                    ? asSent({ ...s, content: { ...s.content, image: PHOTO } })
                    : asSent(s),
            ),
        });
        const link = await nw.post<{ id: string; token: string }>(
            `/sites/${siteId}/preview-links`,
            { expiresInDays: 1 },
        );
        linkId = link.id;

        const preview = await context.newPage();
        await preview.goto(`${urls.RENDERER_URL}/preview/${link.token}`);
        const img = preview.locator(`img[alt="${PHOTO.alt}"]`).first();
        await expect(img).toBeAttached();

        // Its room is kept before it arrives: nothing below it moves.
        await expect(img).toHaveAttribute("width", String(PHOTO.width));
        await expect(img).toHaveAttribute("height", String(PHOTO.height));
        // Fetched at once, ahead of everything else.
        await expect(img).toHaveAttribute("fetchpriority", "high");
        await expect(img).toHaveAttribute("loading", "eager");

        const srcset = await img.getAttribute("srcset");
        if (srcset) {
            // A resizing build: every version is a ladder step through the
            // image route, none wider than the photo, and `sizes` is said.
            await expect(img).toHaveAttribute("sizes", /\S/);
            for (const candidate of srcset.split(",")) {
                const [url = "", descriptor = ""] = candidate
                    .trim()
                    .split(/\s+/);
                const step = Number(/^\/_img\/(\d+)\//.exec(url)?.[1]);
                expect(LADDER, candidate).toContain(step);
                expect(Number.parseInt(descriptor, 10)).toBeLessThanOrEqual(
                    PHOTO.width,
                );
            }
        } else {
            // Without the Worker: the photo's own address, as before.
            await expect(img).toHaveAttribute("src", PHOTO.src);
            await expect(img).not.toHaveAttribute("sizes");
        }

        // Preloaded from the head with the same sources the <img> names.
        const preloads = preview.locator(
            'head link[rel="preload"][as="image"]',
        );
        const src = (await img.getAttribute("src")) ?? "";
        const matching = srcset
            ? preloads.and(preview.locator(`[imagesrcset="${srcset}"]`))
            : preloads.and(preview.locator(`[href="${src}"]`));
        await expect(matching).toHaveCount(1);
        await expect(matching).toHaveAttribute("fetchpriority", "high");
        await preview.close();
    } finally {
        // Put Northwind's draft back as it was, and take the link back.
        const now = await nw.get<{ revision: number }>(draftPath);
        await nw.put(`${draftPath}/sections`, {
            revision: now.revision,
            sections: before.sections.map(asSent),
        });
        if (linkId) {
            await page.request.delete(
                `${urls.API_URL}/organizations/${nw.headers["x-organization-id"]}/sites/${siteId}/preview-links/${linkId}`,
                { headers: nw.headers },
            );
        }
    }
});

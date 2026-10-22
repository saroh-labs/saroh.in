import { describe, expect, it } from "vitest";

import { fillBusinessDetails } from "./fill-details";
import { withGallerySamples } from "./gallery-patches";
import {
    GYM_GALLERY_SAMPLE,
    SALON_GALLERY_SAMPLE,
    STUDIO_GALLERY_SAMPLE,
} from "./index";
import { instantiateTemplate } from "./instantiate";
import { lookShowcaseTemplate } from "./look-showcase";
import { gallerySampleIn } from "./sample-words";

const facts = {
    team: [
        { name: "Asha Rao", title: "Head stylist" },
        { name: "Vikram", title: null },
    ],
    address: "4 Market Lane, Indiranagar, Bengaluru",
    town: "Bengaluru",
};

/** A showcase template's pages as the starter copies them. */
function starter(look: "quiet" | "live" | "folio" | null) {
    const template = lookShowcaseTemplate(look);
    const made = instantiateTemplate(template, {
        organizationName: "Sample",
        contactEmail: "hello@example.com",
        modules: ["WEBSITE", ...(template.uses ?? [])],
    });
    return withGallerySamples(template.id, made);
}

function section(
    look: "quiet" | "live" | "folio" | null,
    type: string,
    page = "/",
) {
    const s = starter(look)
        .pages.find((p) => p.path === page)
        ?.sections.find((x) => x.type === type);
    if (!s) throw new Error(`No ${type} on ${page}`);
    return s.content as Record<string, unknown>;
}

describe("fillBusinessDetails", () => {
    it("puts the staff in place of the sample stylists, in order", () => {
        const person = section("quiet", "person");
        const { content, filled } = fillBusinessDetails(
            "person",
            person,
            facts,
        );
        expect(filled).toEqual(["team"]);
        expect(content.name).toBe("Asha Rao");
        expect(content.role).toBe("Head stylist");
        // The sample stylist's line went with her.
        expect(content.bio).toBeUndefined();
        const people = content.people as Record<string, unknown>[];
        expect(people[0]?.name).toBe("Vikram");
        expect(people[0]?.role).toBeUndefined();
        // Past the last member of staff, the sample stays, and the check
        // still names it.
        expect(people[1]?.name).toBe(SALON_GALLERY_SAMPLE.stylists[2].name);
        expect(gallerySampleIn([String(people[1]?.bio)])).not.toBeNull();
    });

    it("finds nothing to fill the second time, so no one is shown twice", () => {
        const once = fillBusinessDetails(
            "person",
            section("quiet", "person"),
            facts,
        );
        const twice = fillBusinessDetails("person", once.content, facts);
        expect(twice.filled).toEqual([]);
        expect(twice.content).toEqual(once.content);
    });

    it("never replaces a person the owner has renamed", () => {
        const person = {
            ...section("live", "person"),
            name: "Our own coach",
            bio: GYM_GALLERY_SAMPLE.coaches[0].bio,
        };
        const { content } = fillBusinessDetails("person", person, facts);
        expect(content.name).toBe("Our own coach");
        expect(content.bio).toBe(GYM_GALLERY_SAMPLE.coaches[0].bio);
        // The next sample coach takes the first member of staff.
        const people = content.people as Record<string, unknown>[];
        expect(people[0]?.name).toBe("Asha Rao");
    });

    it("keeps an edited line under a replaced name", () => {
        const person = { ...section("quiet", "person"), bio: "My own words." };
        const { content } = fillBusinessDetails("person", person, facts);
        expect(content.name).toBe("Asha Rao");
        expect(content.bio).toBe("My own words.");
    });

    it("puts the business's address in place of the studio's", () => {
        const contact = section("folio", "contact");
        expect(contact.address).toBe(STUDIO_GALLERY_SAMPLE.address);
        const { content, filled } = fillBusinessDetails(
            "contact",
            contact,
            facts,
        );
        expect(content.address).toBe(facts.address);
        expect(filled).toEqual(["address"]);
    });

    it("fills the studio's facts under their place and people labels", () => {
        const text = section("folio", "richText");
        const { content, filled } = fillBusinessDetails(
            "richText",
            text,
            facts,
        );
        const html = String(content.value);
        expect(html).toContain("<dt>Studio</dt><dd>Bengaluru</dd>");
        expect(html).toContain("<dt>Who</dt><dd>Asha Rao and Vikram</dd>");
        // The year has nothing to fill it.
        expect(html).toContain(
            `<dd>${STUDIO_GALLERY_SAMPLE.studio.facts[2]}</dd>`,
        );
        expect(filled.sort()).toEqual(["team", "town"]);
    });

    it("changes nothing when the business has said nothing", () => {
        const person = section("quiet", "person");
        const out = fillBusinessDetails("person", person, { team: [] });
        expect(out.content).toEqual(person);
        expect(out.filled).toEqual([]);
    });

    it("leaves the owner's own words alone", () => {
        const content = {
            address: "Our own place",
            value: "<dl><dt>Studio</dt><dd>Our street</dd></dl>",
        };
        const out = fillBusinessDetails("contact", content, facts);
        expect(out.content).toEqual(content);
        expect(out.filled).toEqual([]);
    });
});

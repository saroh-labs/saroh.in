import type { SectionFrameSettings, SectionTone } from "@saroh/block-contract";
import { sectionFrameSettingsOf } from "@saroh/block-contract";

import type { Section } from "@/lib/sites/service";

/**
 * A section's frame (KTD-E5) as the inspector reads and writes it: Hide on
 * phone, Background and Spacing. Pure, so the panes and the canvas toolbar
 * share one rule and a test can hold it.
 */

type Content = Record<string, unknown>;

/** The older band (`section-frame.ts`) as the tone that replaces it. */
const BAND_TONE: Record<string, SectionTone> = {
    surface: "tint",
    accent: "brand",
    inverse: "dark",
};

export function frameOf(section: Section): SectionFrameSettings {
    return sectionFrameSettingsOf(section.content);
}

/** The section with its frame changed; an emptied frame is left out. */
export function withFrame(
    section: Section,
    patch: {
        [K in keyof SectionFrameSettings]?: SectionFrameSettings[K] | undefined;
    },
): Section {
    const frame: Content = { ...frameOf(section) };
    for (const key of Object.keys(patch) as (keyof SectionFrameSettings)[]) {
        const value = patch[key];
        if (value === undefined) delete frame[key];
        else frame[key] = value;
    }
    const content: Content = { ...(section.content as Content) };
    if (Object.keys(frame).length === 0) delete content.frame;
    else content.frame = frame;
    return { ...section, content } as Section;
}

/** The ground it sits on: the tone, else the band it had, else the page. */
export function toneOf(section: Section): SectionTone {
    const band = (section.content as Content).band;
    return (
        frameOf(section).tone ??
        (typeof band === "string" ? BAND_TONE[band] : undefined) ??
        "page"
    );
}

/** A tone chosen in Style replaces the older band, so one ground wins. */
export function withTone(section: Section, tone: SectionTone): Section {
    const next = withFrame(section, {
        tone: tone === "page" ? undefined : tone,
    });
    const content: Content = { ...(next.content as Content) };
    delete content.band;
    return { ...next, content } as Section;
}

/** How many ways it differs from the site look: ground, spacing, padding. */
export function styleChanges(section: Section): number {
    const c = section.content as Content;
    const frame = frameOf(section);
    return [
        frame.tone ?? c.band,
        frame.spacing,
        c.padding,
        // Each kind styled for the section as a whole (DEC-251).
        ...Object.values(frame.styles ?? {}),
    ].filter((v) => v !== undefined).length;
}

/** Back to the site look: no tone, band, spacing or own padding. */
export function resetToLook(section: Section): Section {
    const next = withFrame(section, {
        tone: undefined,
        spacing: undefined,
        styles: undefined,
    });
    const content: Content = { ...(next.content as Content) };
    delete content.band;
    delete content.padding;
    return { ...next, content } as Section;
}

/**
 * A copy to go below it (Duplicate): a new key, and none of what a page may
 * hold only once, its link name and menu label, or a form it would share.
 */
export function duplicateOf(section: Section): Section {
    const content: Content = structuredClone(section.content as Content);
    delete content.anchor;
    delete content.navLabel;
    delete content.formId;
    return { ...section, key: crypto.randomUUID(), content } as Section;
}

/**
 * The selectable visual worlds.
 *
 * A skin is a token scope in `@saroh/ui/globals.css` and nothing else — no
 * component knows one exists. That is what makes this list cheap to extend: a
 * new world is a CSS block plus an entry here.
 *
 * Kept as data, and shared by the switcher AND the pre-paint script, so the two
 * can never disagree about which skins are valid or which is default.
 */
export const SKINS = [
    {
        id: "panel",
        name: "Panel",
        blurb: "Instrument calm, stockroom rigour. Green means actionable.",
        /** Swatches for the picker: ground, then the signal colours. */
        swatch: ["#0A0D0F", "#F2F2F0", "#6EF3A5", "#FFB020", "#FF5A00"],
    },
    {
        id: "instrument",
        name: "Instrument",
        blurb: "Matte panel, luminous markings. Amber and red mean caution.",
        swatch: ["#08090A", "#DFE5E2", "#7CFFB2", "#FFB020", "#FF4D3D"],
    },
    {
        id: "stockroom",
        name: "Stockroom",
        blurb: "Black nylon, stockroom white, hazard orange. Labels name things.",
        swatch: ["#0B0B0B", "#FFFFFF", "#FF5A00", "#8C8C88", "#262626"],
    },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];

/** The fusion leads: it is the one both other worlds were folded into. */
export const DEFAULT_SKIN: SkinId = "panel";

export const SKIN_STORAGE_KEY = "saroh-skin";

export function isSkinId(value: unknown): value is SkinId {
    return SKINS.some((skin) => skin.id === value);
}

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
        id: "mono",
        name: "Mono",
        blurb: "Pure black and white, one blue for links. Contrast is the accent.",
        swatch: ["#000000", "#FFFFFF", "#0070F3", "#8F8F8F", "#EAEAEA"],
    },
    {
        id: "panel",
        name: "Panel",
        blurb: "Razor-edged and deep. Ink violet means actionable.",
        /** Swatches for the picker: ground, then the signal colours. */
        swatch: ["#0B0A0E", "#F5F4F7", "#7C4DE8", "#F5A524", "#E5484D"],
    },
    {
        id: "instrument",
        name: "Instrument",
        blurb: "Matte panel, luminous markings. Teal means actionable.",
        swatch: ["#08090A", "#DDE3E3", "#3FE0DC", "#F5A524", "#E5484D"],
    },
    {
        id: "stockroom",
        name: "Stockroom",
        blurb: "Carbon, stockroom white, rust. Labels name things.",
        swatch: ["#0B0B0B", "#FFFFFF", "#E85A16", "#8C8880", "#262626"],
    },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];

/**
 * Mono leads and is the default.
 *
 * It is the only skin with NO `[data-skin]` block in globals.css — it IS the
 * base `:root` / `.dark` register, so selecting it means "add no overrides".
 * That is deliberate: the base tokens are the monochrome ones now, and giving
 * mono its own block would mean maintaining the same palette in two places and
 * letting them drift.
 */
export const DEFAULT_SKIN: SkinId = "mono";

/**
 * Versioned deliberately.
 *
 * `DEFAULT_SKIN` only applies to someone with NOTHING stored, so bumping the
 * default alone would have left every existing user on Panel — the old default
 * — and they would never have seen the monochrome identity at all. Panel was
 * what people were handed, not something most of them chose, so carrying it
 * forward preserves an accident rather than a preference.
 *
 * Bumping the key retires the old value in one move: everyone lands on Mono,
 * and a skin picked from here on is a real choice and is kept. The old
 * `saroh-skin` entry is simply ignored — not read, not migrated, not deleted
 * (clearing other people's storage keys is not this component's business).
 */
export const SKIN_STORAGE_KEY = "saroh-skin-v2";

export function isSkinId(value: unknown): value is SkinId {
    return SKINS.some((skin) => skin.id === value);
}

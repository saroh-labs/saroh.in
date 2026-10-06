/**
 * An image slot drawn as its brief (industry templates U14, KTD-5): the
 * words saying what the photograph should show, on a ground tinted from the
 * template's own colours. The gallery's renders use it wherever a design
 * has a photograph, so a capture never passes off a stock photo — or any
 * photo at all — as the business's.
 *
 * A self-contained SVG `data:` URL, so the blocks' plain `<img>` draws it
 * with nothing fetched. The words are wrapped and centred, with room round
 * them, so a block that crops its image to a different shape (`object-
 * cover`) still shows them whole.
 */

/** `"40 24% 97%"` (the `--site-*` notation) as a colour SVG reads. */
export function hslOf(triple: string | undefined, fallback: string): string {
    const parts = (triple ?? "").trim().split(/\s+/);
    if (parts.length !== 3) return fallback;
    return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** The brief in lines of at most `width` characters, broken at spaces. */
export function wrapBrief(text: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.trim().split(/\s+/)) {
        if (line && line.length + 1 + word.length > width) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

export interface BriefColours {
    /** The slot's ground. */
    ground: string;
    /** The words. */
    ink: string;
}

export function briefImage(
    brief: string,
    colours: BriefColours,
    size: { width: number; height: number } = { width: 1200, height: 900 },
    /**
     * `top`: small, in a narrow column at the top, for a slot words are set
     * over low down (the full-bleed hero), so the brief never runs into the
     * headline, and a phone's tall crop of the middle still shows it whole.
     */
    placement: "centre" | "top" = "centre",
): string {
    const { width, height } = size;
    const corner = placement === "top";
    // Sized to the shorter side, so a tall slot's words are not tiny.
    const fontSize = Math.round(Math.min(width, height) / (corner ? 34 : 20));
    // Inside the middle of the width (60%, or 30% at the top), whatever
    // the block crops to.
    const perLine = Math.max(
        12,
        Math.floor(
            (Math.min(width, height * 1.2) * (corner ? 0.3 : 0.6)) /
                (fontSize * 0.52),
        ),
    );
    const lines = wrapBrief(brief, perLine).slice(0, 6);
    const lineHeight = Math.round(fontSize * 1.35);
    const labelSize = Math.round(fontSize * 0.62);
    const blockHeight = labelSize * 2 + lines.length * lineHeight;
    const top = corner
        ? Math.round(height * 0.16)
        : Math.round((height - blockHeight) / 2) + labelSize;
    const x = Math.round(width / 2);
    const text = lines
        .map(
            (l, i) =>
                `<text x="${x}" y="${top + labelSize * 2 + i * lineHeight}" font-size="${fontSize}">${escapeXml(l)}</text>`,
        )
        .join("");
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        `<rect width="100%" height="100%" fill="${colours.ground}"/>` +
        `<g fill="${colours.ink}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" text-anchor="middle">` +
        `<text x="${x}" y="${top}" font-size="${labelSize}" letter-spacing="${Math.round(labelSize * 0.14)}" opacity="0.7">PHOTOGRAPH</text>` +
        `<g font-style="italic">${text}</g>` +
        `</g></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

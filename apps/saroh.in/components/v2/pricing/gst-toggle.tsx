"use client";

/** The Pricing design's "Show prices with GST" box; its default comes from the catalogue. */
export function GstToggle({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-mk-copy">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="m-0 h-4 w-4 cursor-pointer accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
            />
            Show prices with GST
        </label>
    );
}

import type { Device, Zoom } from "../editor-constants";

/** "Desk view", "Tablet view", "Phone view": More › Width's word. */
const VIEW_WORD: Record<Device, string> = {
    desktop: "Desk view",
    tablet: "Tablet view",
    phone: "Phone view",
};

/**
 * The line over the page (`fix/WXKRest`): where it will be, that it is the
 * draft, and how it is shown: "gulmohar.saroh.app/services/bridal · Draft ·
 * Desk view", with the zoom when it is not 100%.
 */
export function CanvasBar({
    address,
    path,
    device,
    zoom,
}: {
    address: string | null;
    path: string;
    device: Device;
    zoom: Zoom;
}) {
    const link = address ? `${address}${path === "/" ? "" : path}` : path;
    return (
        <div
            data-canvas-bar=""
            className="flex h-7 shrink-0 items-center gap-2.5 bg-muted px-4 font-mono text-xs text-muted-foreground"
        >
            <span
                aria-hidden
                className="size-[7px] shrink-0 rounded-full bg-muted-foreground/60"
            />
            <b className="min-w-0 truncate font-medium text-foreground">
                {link}
            </b>
            <span>Draft</span>
            <span className="flex-1" />
            {zoom === 100 ? null : (
                <span>{zoom === "fit" ? "Fit" : `${zoom}%`}</span>
            )}
            <span>{VIEW_WORD[device]}</span>
        </div>
    );
}

/**
 * The amber bar over a draft preview (Pricing design, `isPreview`). No link
 * back to the console: saroh.in never knows whether the viewer is staff.
 */
export function PreviewBanner({
    children = "Draft preview. Visitors still see the published pricing.",
}: {
    children?: React.ReactNode;
}) {
    return (
        <div
            role="status"
            className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 bg-mk-saffron px-mk-nav py-2.5 text-sm font-semibold text-foreground"
        >
            <span>{children}</span>
        </div>
    );
}

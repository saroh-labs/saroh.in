/**
 * The amber bar over a draft preview (Pricing design, `isPreview`). No link
 * back to the console: saroh.in never knows whether the viewer is staff.
 * `controls` is the preview's Draft/Live, Desktop/Phone and Show what
 * changed (admin redesign U13), beside the words.
 */
export function PreviewBanner({
    children = "Draft preview. Visitors still see the published pricing.",
    controls,
}: {
    children?: React.ReactNode;
    controls?: React.ReactNode;
}) {
    return (
        <div className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 bg-mk-saffron px-mk-nav py-2.5 text-sm font-semibold text-foreground">
            <span role="status" className="min-w-0 flex-[1_1_260px]">
                {children}
            </span>
            {controls}
        </div>
    );
}

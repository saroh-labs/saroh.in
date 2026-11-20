import type { ReactNode } from "react";

/**
 * The right column's frame (U46): a title row and a tab strip over the
 * body. U47 fills `header` ("Page · Nothing selected", "<label> · <kind>
 * section · n of m") and `tabs` (Content · Style · Visibility · Feedback);
 * until then both are absent and the body is today's `InspectorHost`.
 * 360 wide at 1920, 340 at 1440 (the column's width, set by the shell).
 */
export function InspectorFrame({
    header,
    tabs,
    children,
}: {
    header?: ReactNode;
    tabs?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div
            data-inspector-frame=""
            className="flex min-h-0 min-w-0 flex-col bg-background"
        >
            {header}
            {tabs}
            {/* A grid row, so the body (today's InspectorHost) fills and scrolls. */}
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
                {children}
            </div>
        </div>
    );
}

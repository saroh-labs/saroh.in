import { cn } from "@saroh/ui/lib/utils";

/**
 * The wrapper every screen in the workspace shell sits in.
 *
 * Before this, each page hand-rolled its own: `mx-auto max-w-5xl p-8` here,
 * `mx-auto w-full max-w-7xl p-6 sm:p-8` there, and — on four pages under
 * `/sites` — nothing at all, so the heading and the rows sat flush against the
 * shell with no gutter. On a 1440px screen, Commerce's title began 280px
 * further right than Schedule's. Two screens of one product should not look
 * like two products.
 *
 * The widths are the scale `docs/design-system/04_LAYOUT_SYSTEM.md` proposed
 * after counting eleven ad-hoc `max-w-` values in this app, now that there is
 * one container to apply them:
 *
 *  - **form** (`max-w-2xl`) — settings and create/edit forms. A field is
 *    unreadable when it is 1200px wide.
 *  - **default** (`max-w-5xl`) — lists, details and dashboards: most screens.
 *  - **wide** (`max-w-7xl`) — tables, boards and analytics grids, which are
 *    worth the room.
 *
 * The padding never varies: 24px on a phone, 32px from `sm` up.
 *
 * LEFT-ALIGNED, not centred. Centring each page inside its own max-width is
 * what made the app feel unsettled: Home's heading landed 88px right of
 * Schedule's and Settings' 176px right again, so the eye had to find the text
 * anew on every navigation. The sidebar already anchors the layout to the left;
 * the content starts in the same place on every screen and only its right edge
 * moves.
 */
export function PageContainer({
    width = "default",
    className,
    children,
}: {
    width?: "form" | "default" | "wide";
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <main
            className={cn(
                "w-full space-y-6 p-6 sm:p-8",
                width === "form"
                    ? "max-w-2xl"
                    : width === "wide"
                      ? "max-w-7xl"
                      : "max-w-5xl",
                className,
            )}
        >
            {children}
        </main>
    );
}

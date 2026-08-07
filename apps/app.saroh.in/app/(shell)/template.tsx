/**
 * A `template`, not a `layout`: Next remounts this on every navigation while a
 * layout persists. That remount is what lets the entrance animation replay per
 * route change — in a layout it would run once per session and never again.
 *
 * It wraps only the page content, NOT the shell. The sidebar and header live in
 * `layout.tsx` and deliberately stay put: re-animating the chrome on every
 * click would make the app feel like it reloads rather than navigates.
 *
 * Kept to a 6px/260ms rise (see workspace.css) because this fires on every
 * single page change; the resting state is the visible one, so with reduced
 * motion the page simply appears.
 */
export default function ShellTemplate({
    children,
}: {
    children: React.ReactNode;
}) {
    return <div className="wk-route flex flex-1 flex-col">{children}</div>;
}

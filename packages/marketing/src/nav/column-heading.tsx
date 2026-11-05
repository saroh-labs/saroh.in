/** A menu column's quiet heading; none where the column has no group. */
export function ColumnHeading({
    className,
    children,
}: {
    className: string;
    children?: string;
}) {
    return children ? (
        <p aria-hidden className={className}>
            {children}
        </p>
    ) : null;
}

import { NewTag } from "../links/pill";

/** A menu item's name (with its "new" tag) and line, shared by the desk menu and the phone sheet. */
export function MenuItemText({
    item,
    nameClass,
}: {
    item: { name: string; line?: string; isNew?: boolean };
    nameClass: string;
}) {
    return (
        <>
            <span className={`${nameClass} font-semibold`}>
                {item.name}
                {item.isNew ? <NewTag /> : null}
            </span>
            {item.line ? (
                <span className="text-mk-note leading-[1.4] text-muted-foreground">
                    {item.line}
                </span>
            ) : null}
        </>
    );
}

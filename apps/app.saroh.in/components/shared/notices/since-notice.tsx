import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";

/**
 * Says a list is narrowed to the last 24 hours (`?since=`, round 2, F6) and
 * offers the whole list back. A list opened from Home's "3 new orders" must
 * not pass for every order, so the narrowing is said, not only applied. A
 * thin wrapper over `Notice`, kept for its wording.
 */
export function SinceNotice({
    count,
    noun,
    verb,
    clearHref,
}: {
    count: number;
    noun: { one: string; other: string };
    /** "placed", "made", "left", "paid". */
    verb: string;
    clearHref: string;
}) {
    return (
        <Notice
            role="status"
            icon={false}
            action={<TextLink href={clearHref}>Show all {noun.other}</TextLink>}
        >
            {count === 0
                ? `No ${noun.other} ${verb} in the last 24 hours.`
                : `Only the ${count === 1 ? noun.one : `${count} ${noun.other}`} ${verb} in the last 24 hours.`}
        </Notice>
    );
}

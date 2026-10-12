import { formatMoneyMajor, formatNumber } from "@/lib/format/money";
import { count, plural } from "@/lib/format/plural";

/**
 * What a GST change does to the next renewal of the members already on a
 * plan (12 Oct 2026), in words. Pure and client-safe.
 *
 * A member keeps the price they joined at, and every invoice written from
 * then on reads the plan's GST as it stands that day. So a rate chosen, or
 * "GST is added" turned on, reaches members at their next renewal: the
 * amount goes up where GST is added to the price, and stays the same where
 * the price includes it. An invoice already issued never changes.
 *
 * The sums are the API's (`renewalChange` on the Plan Editor's read). The
 * rates sheet works its own out with the preview mirror in
 * `lib/gst/price-mode.ts` and says them through the same words.
 */

/** Members who pay one price: their next renewal now, and once it is saved. */
export interface RenewalGroup {
    members: number;
    currency: string;
    /** Their renewal as it is charged today: "2000.00". */
    from: string;
    /** Their renewal once the GST shown is saved: "2360.00". */
    to: string;
}

/** The API's `renewalChange`: what publishing the GST shown does. */
export interface RenewalChange {
    /** Everyone on the plan now. */
    members: number;
    /** By the price each pays. */
    groups: RenewalGroup[];
    /** How many members' amount changes. 0: nobody's. */
    changed: number;
    /**
     * Of those, how many pay by autopay with a limit below the new amount.
     * They are never charged above it: the renewal goes out as an invoice
     * with a pay link.
     */
    aboveAutopayLimit: number;
}

const whose = (n: number) => count(n, "member's", "members'");

function moved(group: RenewalGroup): boolean {
    return Number(group.from) !== Number(group.to);
}

function fromTo(group: RenewalGroup): string {
    return `from ${formatMoneyMajor(group.from, group.currency)} to ${formatMoneyMajor(group.to, group.currency)}`;
}

/**
 * The sentences, in order. None when nobody is on the plan.
 *
 * `gstInside` is whether the unchanged amount has GST in it to show (a rate
 * above 0%): an exempt plan's invoice has none, so nothing is said of it.
 */
export function renewalChangeLines(
    change: RenewalChange | null | undefined,
    { gstInside = true }: { gstInside?: boolean } = {},
): string[] {
    if (!change || change.members <= 0) return [];
    const changing = change.groups.filter(moved);
    const changed = changing.reduce((n, g) => n + g.members, 0);
    if (change.changed <= 0 || changed === 0) {
        const same = `${whose(change.members)} next renewal stays the same amount.`;
        return gstInside
            ? [same, "Their invoice will show the GST inside it."]
            : [same];
    }
    const lines: string[] = [];
    if (changing.length === 1 && changing[0]) {
        lines.push(
            `${whose(changed)} next renewal changes ${fromTo(changing[0])}.`,
        );
    } else {
        lines.push(`${whose(changed)} next renewal changes:`);
        for (const group of changing) {
            lines.push(`${count(group.members, "member")} ${fromTo(group)}.`);
        }
    }
    const rest = change.members - changed;
    if (rest > 0) {
        lines.push(`${whose(rest)} next renewal stays the same amount.`);
    }
    if (change.aboveAutopayLimit > 0) {
        const n = change.aboveAutopayLimit;
        const who =
            changed === 1
                ? "They pay"
                : `${formatNumber(n)} of them ${plural(n, "pays", "pay")}`;
        lines.push(
            `${who} by autopay with a limit below the new amount. Their renewal goes out as an invoice with a pay link.`,
        );
    }
    return lines;
}

/** Whether the change raises or lowers anyone's amount. */
export function renewalAmountChanges(
    change: RenewalChange | null | undefined,
): boolean {
    return Boolean(change && change.changed > 0 && change.groups.some(moved));
}

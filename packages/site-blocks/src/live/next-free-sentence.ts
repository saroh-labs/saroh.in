import type { PublicTodayItem } from "../blocks/on-today";
import { nextFreeWhen } from "./live-words";

/**
 * Folio's next booking as a sentence (board VA01's `.now` card): "I'd like
 * a Hatha yoga with Meera on Wed 21 Oct at 7:00 am." The person is the
 * time's own, or "anyone free" when the service has none.
 */
export function nextFreeSentence(
    item: Pick<PublicTodayItem, "serviceName" | "staffName" | "date" | "time">,
    today: string,
): { article: "a" | "an"; what: string; who: string; when: string } {
    const said = nextFreeWhen(item, today);
    // "today, 7:00 am" reads "today at 7:00 am" in a sentence.
    const comma = said.lastIndexOf(", ");
    return {
        article: /^[aeiou]/i.test(item.serviceName) ? "an" : "a",
        what: item.serviceName,
        who: item.staffName ?? "anyone free",
        when:
            comma === -1
                ? said
                : `${said.slice(0, comma)} at ${said.slice(comma + 2)}`,
    };
}

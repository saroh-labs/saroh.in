import { optionClasses } from "../styles";

export function PayOption({
    on,
    label,
    sub,
    tag,
    onPick,
}: {
    on: boolean;
    label: string;
    sub: string;
    /** A short word at the end of the row: "Included" (A10). */
    tag?: string;
    onPick: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            onClick={onPick}
            className={optionClasses(on)}
        >
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className="text-site-body mt-0.5 block text-[13px]">
                    {sub}
                </span>
            </span>
            {tag ? (
                <span className="bg-site-accent text-site-accent-fg whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold">
                    {tag}
                </span>
            ) : null}
        </button>
    );
}

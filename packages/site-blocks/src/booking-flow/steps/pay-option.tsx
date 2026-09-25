import { optionClasses } from "../styles";

export function PayOption({
    on,
    label,
    sub,
    onPick,
}: {
    on: boolean;
    label: string;
    sub: string;
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
        </button>
    );
}

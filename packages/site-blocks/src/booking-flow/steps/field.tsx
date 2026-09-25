import { cn } from "../../lib/utils";
import { focusRing, inputFill } from "../styles";

export function Field({
    id,
    label,
    value,
    onChange,
    error,
    type = "text",
    autoComplete,
    placeholder,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error: string | null;
    type?: string;
    autoComplete?: string;
    placeholder?: string;
}) {
    return (
        <div className="mt-3 first-of-type:mt-0">
            <label
                htmlFor={id}
                className="text-site-fg block text-[13.5px] font-medium"
            >
                {label}
            </label>
            <input
                id={id}
                type={type}
                autoComplete={autoComplete}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(
                    "border-site-border text-site-fg placeholder:text-site-muted mt-1.5 block h-[45px] w-full rounded-[calc(var(--site-radius)+7px)] border px-3.5 text-[15px]",
                    inputFill,
                    focusRing,
                )}
            />
            {error ? (
                <p
                    id={`${id}-error`}
                    className="text-site-fg mt-1.5 text-[12.5px] font-medium"
                >
                    {error}
                </p>
            ) : null}
        </div>
    );
}

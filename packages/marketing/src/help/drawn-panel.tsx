import { cn } from "../cn";

/**
 * Another company's screen, drawn plainly (plan 2026-11-13-002, U9, boards
 * VHClaude and VHChatgpt): Claude's or ChatGPT's connector form, or a chat
 * in one, which Saroh can't capture. Every word is text, never an image,
 * inside a `figure` whose caption says it is a drawing, so nobody takes it
 * for the app's real screen. Saroh's own screens are captures, never this.
 */
export type DrawnPanelData =
    | {
          kind: "form";
          /** Whose screen: "Claude". */
          app: string;
          /** The address bar's words. */
          address: string;
          title: string;
          /** `mark`: the field the step names, ringed in Saffron. */
          fields: readonly {
              label: string;
              value: string;
              mono?: boolean;
              mark?: boolean;
          }[];
          /** A ticked box under the fields. */
          check?: string;
          button: string;
      }
    | {
          kind: "chat";
          app: string;
          address: string;
          ask: string;
          rows: readonly { label: string; value: string }[];
          reply: string;
      };

export function DrawnPanel({
    panel,
    caption,
    className,
}: {
    panel: DrawnPanelData;
    caption: string;
    className?: string;
}) {
    return (
        <figure className={cn("m-0 grid gap-2", className)}>
            <div
                data-panel={panel.kind}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-mk-lift"
            >
                <div className="flex items-center gap-3 border-b border-border bg-muted px-3 py-2">
                    <span aria-hidden className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                            <span
                                key={i}
                                className="size-2 rounded-full bg-border-strong"
                            />
                        ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-card px-2.5 py-1 text-[12px] text-muted-foreground">
                        {panel.address}
                    </span>
                </div>
                <div className="grid place-items-center bg-muted/60 px-4 py-8 sm:px-10">
                    {panel.kind === "form" ? (
                        <FormPanel panel={panel} />
                    ) : (
                        <ChatPanel panel={panel} />
                    )}
                </div>
            </div>
            <figcaption className="text-mk-note text-muted-foreground">
                {caption}
            </figcaption>
        </figure>
    );
}

function FormPanel({
    panel,
}: {
    panel: Extract<DrawnPanelData, { kind: "form" }>;
}) {
    return (
        <div className="grid w-full max-w-[420px] gap-3.5 rounded-xl border border-border bg-card p-5 text-[14px] shadow-sm">
            <p className="m-0 font-semibold">{panel.title}</p>
            {panel.fields.map((f) => (
                <div key={f.label} className="grid gap-1.5">
                    <span className="text-[13px] font-semibold">{f.label}</span>
                    <span
                        className={cn(
                            "truncate rounded-lg border border-border px-3 py-2",
                            f.mono && "font-mono text-[13px]",
                            f.mark &&
                                "border-2 border-mk-saffron shadow-[0_0_0_3px_rgba(240,169,43,0.22)]",
                        )}
                    >
                        {f.value}
                    </span>
                </div>
            ))}
            {panel.check ? (
                <span className="flex items-center gap-2 text-[13px]">
                    <span
                        aria-hidden
                        className="grid size-4 place-items-center rounded bg-foreground text-[10px] leading-none text-background"
                    >
                        ✓
                    </span>
                    {panel.check}
                </span>
            ) : null}
            <span className="flex justify-end gap-2">
                <span className="rounded-lg border border-border px-3 py-1.5 font-semibold">
                    Cancel
                </span>
                <span className="rounded-lg bg-foreground px-3 py-1.5 font-semibold text-background">
                    {panel.button}
                </span>
            </span>
        </div>
    );
}

function ChatPanel({
    panel,
}: {
    panel: Extract<DrawnPanelData, { kind: "chat" }>;
}) {
    return (
        <div className="grid w-full max-w-[520px] gap-3 text-[14px]">
            <p className="m-0 max-w-[85%] justify-self-end rounded-2xl bg-card px-4 py-2.5 shadow-sm">
                {panel.ask}
            </p>
            <div className="grid gap-2.5 rounded-xl border border-border bg-card p-4">
                <span className="text-[12px] font-semibold text-muted-foreground">
                    {panel.app}, using Saroh
                </span>
                <p className="m-0 [text-wrap:pretty]">{panel.reply}</p>
                {panel.rows.length > 0 ? (
                    <ul className="m-0 grid list-none gap-1.5 p-0">
                        {panel.rows.map((r) => (
                            <li
                                key={r.label}
                                className="flex gap-3 border-t border-border pt-1.5"
                            >
                                <span className="w-20 shrink-0 font-semibold">
                                    {r.label}
                                </span>
                                <span className="min-w-0">{r.value}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>
        </div>
    );
}

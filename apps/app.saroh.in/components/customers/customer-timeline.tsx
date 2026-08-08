import { Badge } from "@saroh/ui/badge";
import { EmptyState } from "@saroh/ui/empty-state";

import type { TimelineEvent } from "@/lib/customer-workspace/service";

const TYPE_LABEL: Record<string, string> = {
    LEAD: "Lead",
    BOOKING: "Booking",
    ORDER: "Order",
    MESSAGE: "Message",
};

/**
 * A person's chronological cross-module history (#120): leads, bookings, orders,
 * and messages woven into one timeline. Only events from available modules
 * appear (the API enforces that). Dates render on the client's locale.
 */
export function CustomerTimeline({ events }: { events: TimelineEvent[] }) {
    if (events.length === 0) {
        return (
            <EmptyState
                title="No activity yet"
                description="This customer's leads, bookings, orders, and messages will appear here as they happen."
            />
        );
    }

    return (
        <ol className="relative space-y-4 border-l pl-6">
            {events.map((event, i) => (
                <li
                    key={`${event.type}-${event.at}-${i}`}
                    style={{ "--wk-i": i } as React.CSSProperties}
                    className="wk-item relative"
                >
                    <span
                        aria-hidden
                        className="absolute -left-[27px] top-1.5 size-2 rounded-full bg-primary"
                    />
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">
                            {event.title}
                        </span>
                        <Badge variant="outline">
                            {TYPE_LABEL[event.type] ?? event.type}
                        </Badge>
                    </div>
                    <time
                        className="text-xs text-muted-foreground"
                        dateTime={event.at}
                    >
                        {new Date(event.at).toLocaleString()}
                    </time>
                </li>
            ))}
        </ol>
    );
}

import type { CSSProperties, ReactNode } from "react";

import { pct, rupee } from "../money";
import type { Scene, SearchPageData } from "../schema";
import { ChipSvg } from "./icons";

/**
 * The screens design D draws (the for-d boards' parts.py), each filled from
 * the page's sample business. All of it is a picture: the parts sit inside
 * an element that is `aria-hidden` or `role="img"` with the scene's words.
 */

const V = (name: string) => `var(--sp-${name})`;
const LINE = `1px solid ${V("line")}`;
const LINE_SOFT = `1px solid ${V("line-soft")}`;

type Tone = "paid" | "amb" | "grey";
const TONE: Record<Tone, string> = {
    paid: "vc-paid",
    amb: "vc-amb",
    grey: "vc-grey",
};

export function Pill({
    tone,
    text,
    sp = true,
    style,
}: {
    tone: Tone;
    text: string;
    sp?: boolean;
    style?: CSSProperties;
}) {
    return (
        <span
            className={`vc-pill ${sp ? "vc-sp" : ""} ${TONE[tone]}`}
            style={style}
        >
            {text}
        </span>
    );
}

// ---------------------------------------------------------------- shape presets
export const PRESETS = {
    appointments: {
        big: "booking",
        small: ["deposit", "today", "customer", "bill", "website"],
        also: ["pack", "clock", "link", "shield", "calendar", "noshow"],
        button: "Book",
        kind: "services",
        close: "Set up your site and bookings for free, and move up when you need more.",
    },
    classes: {
        big: "timetable",
        small: ["pack", "today", "customer", "bill", "website"],
        also: ["list", "video", "clock", "link", "shield", "calendar"],
        button: "Book",
        kind: "services",
        close: "Set up your site and bookings for free, and move up when you need more.",
    },
    orders: {
        big: "orders",
        small: ["stock", "bill", "customer", "website"],
        also: ["printer", "truck", "link", "shield", "clock", "bill"],
        button: null,
        kind: "products",
        close: "Set up your website for free, and move up when you need more.",
    },
} as const;

export type SmallKey =
    "deposit" | "today" | "customer" | "bill" | "website" | "pack" | "stock";

/** The shape's small tiles; a page that takes no deposit has no deposit tile. */
export function smallKeys(p: SearchPageData): SmallKey[] {
    return PRESETS[p.shape].small.filter(
        (k) => !(k === "deposit" && p.scene.booking?.deposit === "none"),
    );
}

const LABELS: Record<string, string> = {
    deposit: "Deposit",
    today: "Today",
    bill: "Bill",
    website: "Website",
    pack: "Pack",
    stock: "Stock",
};
const CUSTOMER_WORD = {
    orders: "Customer",
    classes: "Student",
    appointments: "Client",
} as const;

/** The phone carousel's labels: the customer word follows the trade, a scene may rename any. */
export function carouselLabels(p: SearchPageData): string[] {
    const t = p.scene.tiles;
    const lab: Record<string, string> = {
        ...LABELS,
        customer: p.family === "Health" ? "Patient" : CUSTOMER_WORD[p.shape],
        deposit: t.deposit?.title.toLowerCase().includes("advance")
            ? "Advance"
            : "Deposit",
        ...p.scene.labels,
    };
    return smallKeys(p).map((k) => lab[k] ?? k);
}

// ---------------------------------------------------------------- hero: today card + outcome chips
const CHIP_POS: CSSProperties[] = [
    { left: -28, top: 46, transform: "rotate(-2deg)" },
    { right: -18, top: 92, transform: "rotate(1.5deg)" },
    { left: 22, bottom: 70, transform: "rotate(1deg)" },
    { right: 18, bottom: 26, transform: "rotate(-1.5deg)" },
];

export function HeroPicture({ scene }: { scene: Scene }) {
    const h = scene.hero;
    return (
        <div role="img" aria-label={scene.heroAlt} className="sp-hero-pic sp-d">
            <div
                aria-hidden="true"
                className="vc-card"
                style={{
                    boxSizing: "content-box",
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 330,
                    padding: 16,
                    borderRadius: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    boxShadow: "0 20px 50px -30px rgba(28,28,26,.4)",
                }}
            >
                <div className="vc-row">
                    <span className="vc-k">{h.title}</span>
                    <span className="vc-sp vc-sm">{h.count}</span>
                </div>
                {h.rows.map((r, i) => {
                    const hi = i === h.highlight;
                    return (
                        <div
                            key={r.time + r.name}
                            className="vc-row"
                            style={
                                hi
                                    ? {
                                          padding: "8px 10px",
                                          margin: "0 -10px",
                                          borderRadius: 8,
                                          background: V("row-hi"),
                                      }
                                    : { padding: "8px 0", borderTop: LINE_SOFT }
                            }
                        >
                            <span
                                className="vc-b"
                                style={{ fontSize: 13, width: 44 }}
                            >
                                {r.time}
                            </span>
                            <span
                                style={{
                                    fontSize: 13.5,
                                    fontWeight: hi ? 600 : undefined,
                                }}
                            >
                                {r.name}
                            </span>
                            <span className="vc-sp vc-sm">{r.right}</span>
                        </div>
                    );
                })}
            </div>
            {scene.chips.map((c, i) => (
                <div
                    key={c.title}
                    aria-hidden="true"
                    className="vc-chip"
                    style={{ position: "absolute", ...CHIP_POS[i] }}
                >
                    <span className={c.icon === "ok" ? "vc-ic ok" : "vc-ic"}>
                        <ChipSvg icon={c.icon} />
                    </span>
                    <span>
                        <span className="vc-b">{c.title}</span>
                        <br />
                        {c.pill ? (
                            <span
                                className="vc-pill vc-amb"
                                style={{
                                    display: "inline-block",
                                    marginTop: 3,
                                }}
                            >
                                {c.pill}
                            </span>
                        ) : (
                            <span className="vc-sm">{c.sub}</span>
                        )}
                    </span>
                </div>
            ))}
        </div>
    );
}

/**
 * The phone's one calm proof card: the first outcome chip (or the scene's
 * `proof`). The paid chip joins it only when it is this booking's own
 * deposit; on other shapes the second chip is about someone else.
 */
export function ProofCard({ page }: { page: SearchPageData }) {
    const s = page.scene;
    const [c0, c1] = s.chips;
    if (!c0 || !c1) return null;
    const dep = depositOf(s);
    const pr = s.proof ?? {
        icon: c0.icon,
        title: c0.title.replace(/^Booked · /, ""),
        sub: c0.sub ?? c0.pill ?? "",
        pill: dep && c1.title.includes(rupee(dep)) ? c1.title : undefined,
    };
    const alt = `${c0.title}: ${pr.sub}${pr.pill ? `, ${pr.pill}` : ""}.`;
    return (
        <div role="img" aria-label={alt} className="sp-proof sp-p">
            <span
                className={pr.icon === "ok" ? "vc-ic ok" : "vc-ic"}
                style={{ width: 40, height: 40, borderRadius: 12 }}
            >
                <ChipSvg icon={pr.icon} />
            </span>
            <span
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minWidth: 0,
                }}
            >
                <span style={{ fontWeight: 600, fontSize: 16 }}>
                    {pr.title}
                </span>
                <span style={{ fontSize: 14, color: V("muted") }}>
                    {pr.sub}
                </span>
                {pr.pill ? (
                    <span
                        className="vc-pill vc-paid"
                        style={{
                            alignSelf: "flex-start",
                            marginTop: 8,
                            fontSize: 13,
                            padding: "4px 10px",
                        }}
                    >
                        {pr.pill}
                    </span>
                ) : null}
            </span>
        </div>
    );
}

// ---------------------------------------------------------------- the browser frames
export function FrameDesk({
    url,
    children,
}: {
    url: string;
    children: ReactNode;
}) {
    const dot = (
        <span
            style={{
                width: 9,
                height: 9,
                borderRadius: 9,
                background: V("dot"),
            }}
        />
    );
    return (
        <div
            className="vc-pic"
            aria-hidden="true"
            style={{
                padding: 0,
                background: V("sand"),
                justifyContent: "flex-start",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderBottom: LINE,
                }}
            >
                {dot}
                {dot}
                {dot}
                <span
                    style={{
                        marginLeft: 10,
                        fontSize: 12,
                        color: V("muted"),
                        background: V("paper"),
                        padding: "4px 12px",
                        borderRadius: 999,
                    }}
                >
                    {url}
                </span>
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
                    gap: 16,
                    padding: 20,
                    background: V("white"),
                    flex: 1,
                }}
            >
                {children}
            </div>
        </div>
    );
}

export function FramePhone({
    url,
    children,
}: {
    url: string;
    children: ReactNode;
}) {
    return (
        <div
            className="vc-pic sp-frame-p"
            aria-hidden="true"
            style={{ padding: 0, background: V("white"), border: LINE, gap: 0 }}
        >
            <div
                style={{
                    padding: "8px 12px",
                    borderBottom: LINE,
                    background: V("paper"),
                    fontSize: 12,
                    color: V("muted"),
                    textAlign: "center",
                }}
            >
                {url}
            </div>
            <div
                style={{
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                }}
            >
                {children}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- big tiles (inside the frame)
function Panel(props: {
    kicker: string;
    rows: [string, string][];
    bigLabel: string;
    bigValue: string;
    button: string;
    foot: string;
    note?: string;
}) {
    return (
        <div
            style={{
                background: V("ink"),
                color: V("paper"),
                borderRadius: 14,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                alignSelf: "start",
            }}
        >
            <span
                style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: V("amber"),
                }}
            >
                {props.kicker}
            </span>
            {props.rows.map(([k, v]) => (
                <div
                    key={k}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        borderBottom: `1px solid ${V("on-ink-line")}`,
                        paddingBottom: 8,
                    }}
                >
                    <span style={{ color: V("on-ink-muted") }}>{k}</span>
                    <span>{v}</span>
                </div>
            ))}
            {props.note ? (
                <span
                    style={{
                        fontSize: 12.5,
                        lineHeight: 1.45,
                        background: V("on-ink-tint"),
                        borderRadius: 8,
                        padding: "8px 10px",
                    }}
                >
                    {props.note}
                </span>
            ) : null}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                }}
            >
                <span style={{ fontSize: 13, color: V("on-ink-muted") }}>
                    {props.bigLabel}
                </span>
                <span className="vc-h" style={{ fontSize: 26 }}>
                    {props.bigValue}
                </span>
            </div>
            <span
                style={{
                    height: 38,
                    borderRadius: 9,
                    background: V("amber"),
                    color: V("ink"),
                    fontWeight: 600,
                    fontSize: 13.5,
                    display: "grid",
                    placeItems: "center",
                }}
            >
                {props.button}
            </span>
            <span
                style={{
                    fontSize: 12,
                    color: V("on-ink-muted"),
                    lineHeight: 1.45,
                }}
            >
                {props.foot}
            </span>
        </div>
    );
}

function Bar({
    l1,
    l2,
    button,
}: {
    l1: string;
    l2: ReactNode;
    button: string;
}) {
    return (
        <div
            style={{
                background: V("ink"),
                color: V("paper"),
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 2,
            }}
        >
            <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                <span style={{ color: V("on-ink-muted") }}>{l1}</span>
                <br />
                {l2}
            </span>
            <span
                style={{
                    marginLeft: "auto",
                    height: 36,
                    padding: "0 14px",
                    borderRadius: 9,
                    background: V("amber"),
                    color: V("ink"),
                    fontWeight: 600,
                    fontSize: 13,
                    display: "grid",
                    placeItems: "center",
                }}
            >
                {button}
            </span>
        </div>
    );
}

function Svc({
    on,
    title,
    sub,
    right,
}: {
    on: boolean;
    title: string;
    sub: ReactNode;
    right: ReactNode;
}) {
    return (
        <div className={`vc-svc ${on ? "on" : ""}`}>
            <span>
                <span className="vc-b">{title}</span>
                <br />
                <span className="vc-sm">{sub}</span>
            </span>
            {right}
        </div>
    );
}

function Lbl({ children, top = true }: { children: string; top?: boolean }) {
    return (
        <span
            className="vc-sm vc-b"
            style={{ color: V("ink"), marginTop: top ? 2 : undefined }}
        >
            {children}
        </span>
    );
}

function Who({ staff, pick }: { staff: string[]; pick: string }) {
    return (
        <>
            <span className="vc-who">Anyone</span>
            {staff.map((s) => (
                <span key={s} className={`vc-who ${s === pick ? "on" : ""}`}>
                    <span className="vc-av">{s.replace("Dr. ", "")[0]}</span>
                    {s}
                </span>
            ))}
        </>
    );
}

function Times({
    times,
    cols,
}: {
    times: { time: string; picked?: boolean; taken?: boolean }[];
    cols: number;
}) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 6,
            }}
        >
            {times.map((t) => (
                <span
                    key={t.time}
                    className={`vc-time ${t.picked ? "on" : t.taken ? "off" : ""}`}
                >
                    {t.time}
                </span>
            ))}
        </div>
    );
}

const DEPOSIT_PART = { none: 0, quarter: 0.25, half: 0.5, full: 1 } as const;

/** The booking's deposit in rupees (0 when it takes none, or isn't a booking page). */
export function depositOf(s: Scene): number {
    const b = s.booking;
    const it = b && s.items[b.item];
    return b && it ? Math.round(it.price * DEPOSIT_PART[b.deposit]) : 0;
}

const col = (gap: number): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap,
});
const h24: CSSProperties = { fontSize: 24, letterSpacing: "-0.03em" };

interface Big {
    desk: ReactNode;
    phone: ReactNode;
}

function bookingPage(s: Scene): Big {
    const b = s.booking;
    const staff = s.staff ?? [];
    if (!b) throw new Error("booking page without scene.booking");
    const it = s.items[b.item];
    if (!it) throw new Error("booking.item is not one of the items");
    const dep = depositOf(s);
    const rest = it.price - dep;
    const timesLbl = staff.length
        ? `${s.day} · ${b.staff}'s free times`
        : `${s.day} · free times`;
    const left = (
        <div style={col(12)}>
            <span className="vc-h" style={h24}>
                Book at {s.business}
            </span>
            <div style={col(6)}>
                {s.items.map((x, i) => (
                    <Svc
                        key={x.name}
                        on={i === b.item}
                        title={x.name}
                        sub={`${x.len} · ${x.who ?? ""}`}
                        right={<span className="vc-b">{rupee(x.price)}</span>}
                    />
                ))}
            </div>
            {staff.length ? (
                <>
                    <Lbl>Who would you like?</Lbl>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Who staff={staff} pick={b.staff} />
                    </div>
                </>
            ) : null}
            <Lbl>{timesLbl}</Lbl>
            <Times times={b.times} cols={5} />
        </div>
    );
    const rows: [string, string][] = [
        ["What", it.name],
        ["When", `${s.day}, ${b.time}`],
        ...(staff.length ? [["Who", b.staff] as [string, string]] : []),
    ];
    const panel = dep ? (
        <Panel
            kicker="Your booking"
            rows={rows}
            bigLabel="Deposit now"
            bigValue={rupee(dep)}
            button={`Book and pay ${rupee(dep)}`}
            foot={`${rupee(rest)} at the ${s.place ?? "desk"}. Add it to your phone's calendar after booking.`}
        />
    ) : (
        <Panel
            kicker="Your booking"
            rows={rows}
            bigLabel="Pay at the visit"
            bigValue={rupee(it.price)}
            button="Book"
            foot="Nothing to pay now. Add it to your phone's calendar after booking."
        />
    );
    const pay = dep ? (
        <>
            Deposit now <span className="vc-b">{rupee(dep)}</span>
        </>
    ) : (
        <>
            Pay at the visit <span className="vc-b">{rupee(it.price)}</span>
        </>
    );
    const phone = (
        <>
            <Svc
                on
                title={it.name}
                sub={`${it.len} · ${it.who ?? ""}`}
                right={<span className="vc-b">{rupee(it.price)}</span>}
            />
            {staff.length ? (
                <>
                    <Lbl top={false}>Who would you like?</Lbl>
                    <div
                        style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            whiteSpace: "nowrap",
                        }}
                    >
                        <Who staff={staff} pick={b.staff} />
                    </div>
                </>
            ) : null}
            <Lbl top={false}>{timesLbl}</Lbl>
            <Times times={b.phoneTimes} cols={4} />
            <Bar
                l1={`${s.day.split(" ")[0]} ${b.time}${staff.length ? ` · ${b.staff}` : ""}`}
                l2={pay}
                button={dep ? "Book and pay" : "Book"}
            />
        </>
    );
    return {
        desk: (
            <>
                {left}
                {panel}
            </>
        ),
        phone,
    };
}

function classTimetable(s: Scene): Big {
    const t = s.timetable;
    const pk = s.pack;
    if (!t || !pk)
        throw new Error("timetable without scene.timetable and scene.pack");
    const it = s.items[t.item];
    if (!it) throw new Error("timetable.item is not one of the items");
    const right = (x: Scene["items"][number]) => (
        <span style={{ textAlign: "right" }}>
            <span className="vc-b">{rupee(x.price)}</span>
            {x.places ? (
                <>
                    <br />
                    <span className="vc-sm">{x.places}</span>
                </>
            ) : null}
        </span>
    );
    const left = (
        <div style={col(12)}>
            <span className="vc-h" style={h24}>
                Classes at {s.business}
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {t.days.map((d) => (
                    <span
                        key={d}
                        className={`vc-who ${d === t.dayTab ? "on" : ""}`}
                    >
                        {d}
                    </span>
                ))}
            </div>
            <Lbl>{`${s.day} · places left show when a class is nearly full`}</Lbl>
            <div style={col(6)}>
                {s.items.map((x, i) => (
                    <Svc
                        key={x.name}
                        on={i === t.item}
                        title={`${x.time ?? ""} · ${x.name}`}
                        sub={`${x.len} · with ${x.teacher ?? ""}`}
                        right={right(x)}
                    />
                ))}
            </div>
        </div>
    );
    const panel = (
        <Panel
            kicker="Your place"
            rows={[
                ["What", it.name],
                ["When", `${s.day}, ${it.time ?? ""}`],
                ["Teacher", it.teacher ?? ""],
            ]}
            bigLabel="From your pack"
            bigValue="1 class"
            button="Book my place"
            foot={`${pk.left - 1} of ${pk.size} classes left after this. Cancel in time and it goes back.`}
        />
    );
    const phone = (
        <>
            <Lbl top={false}>{s.day}</Lbl>
            {s.items.map((x, i) => (
                <Svc
                    key={x.name}
                    on={i === t.item}
                    title={`${x.time ?? ""} · ${x.name}`}
                    sub={x.teacher ?? ""}
                    right={right(x)}
                />
            ))}
            <Bar
                l1={`${s.day.split(" ")[0]} ${it.time ?? ""} · ${it.teacher ?? ""}`}
                l2={
                    <>
                        From your pack <span className="vc-b">1 class</span>
                    </>
                }
                button="Book my place"
            />
        </>
    );
    return {
        desk: (
            <>
                {left}
                {panel}
            </>
        ),
        phone,
    };
}

function orderList(s: Scene): Big {
    const o = s.orders;
    const sel = o?.list[0];
    if (!o || !sel) throw new Error("orders page without scene.orders");
    const row = (x: (typeof o.list)[number], on: boolean) => (
        <Svc
            key={x.no}
            on={on}
            title={x.name}
            sub={
                <>
                    {`#${x.no} · ${x.what} · ${x.how}`}
                    <br />
                    <span style={{ color: V("amber-dark") }}>
                        Note: {x.note}
                    </span>
                </>
            }
            right={
                <span
                    style={{
                        textAlign: "right",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 4,
                    }}
                >
                    <Pill tone={x.stage.tone} text={x.stage.text} sp={false} />
                    <span className="vc-b">{rupee(x.total)}</span>
                </span>
            }
        />
    );
    const left = (
        <div style={col(12)}>
            <div className="vc-row">
                <span className="vc-h" style={h24}>
                    Orders
                </span>
                <span className="vc-sp vc-sm">{o.count}</span>
            </div>
            <div style={col(6)}>{o.list.map((x, i) => row(x, i === 0))}</div>
        </div>
    );
    const panel = (
        <Panel
            kicker={`Order #${sel.no}`}
            rows={[
                ["Items", sel.items ?? ""],
                ["How", sel.how],
            ]}
            bigLabel={sel.payLabel ?? ""}
            bigValue={rupee(sel.total)}
            button="Make a payment link"
            foot={o.foot}
            note={sel.detail}
        />
    );
    const phone = (
        <>
            {o.list.slice(0, 2).map((x, i) => row(x, i === 0))}
            <Bar
                l1={`#${sel.no} · ${sel.due ?? ""}`}
                l2={
                    <>
                        {sel.payLabel}{" "}
                        <span className="vc-b">{rupee(sel.total)}</span>
                    </>
                }
                button="Payment link"
            />
        </>
    );
    return {
        desk: (
            <>
                {left}
                {panel}
            </>
        ),
        phone,
    };
}

export function bigTile(p: SearchPageData): Big {
    const big = PRESETS[p.shape].big;
    return big === "booking"
        ? bookingPage(p.scene)
        : big === "timetable"
          ? classTimetable(p.scene)
          : orderList(p.scene);
}

// ---------------------------------------------------------------- small tiles (the inner of each picture)
function DepositPicker({ s }: { s: Scene }) {
    const b = s.booking;
    if (!b) return null;
    const i = Object.keys(DEPOSIT_PART).indexOf(b.deposit);
    return (
        <>
            <span className="vc-sm vc-b" style={{ color: V("ink") }}>
                Deposit when they book
            </span>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    background: V("white"),
                    border: LINE,
                    borderRadius: 10,
                    padding: 3,
                    fontSize: 12.5,
                    fontWeight: 600,
                    textAlign: "center",
                }}
            >
                {["None", "¼", "½", "Full"].map((l, k) =>
                    k === i ? (
                        <span
                            key={l}
                            style={{
                                padding: "7px 0",
                                borderRadius: 7,
                                background: V("ink"),
                                color: V("paper"),
                            }}
                        >
                            {l}
                        </span>
                    ) : (
                        <span
                            key={l}
                            style={{ padding: "7px 0", color: V("muted") }}
                        >
                            {l}
                        </span>
                    ),
                )}
            </div>
            <div
                className="vc-card vc-row"
                style={{ padding: "10px 12px", marginTop: 4 }}
            >
                <span style={{ fontSize: 13 }}>
                    <span className="vc-b">{b.depositBy}</span>
                    <br />
                    <span className="vc-sm">
                        Deposit {rupee(depositOf(s))} · UPI
                    </span>
                </span>
                <span className="vc-sp vc-pill vc-paid">Paid</span>
            </div>
        </>
    );
}

function TodayList({ s }: { s: Scene }) {
    return (
        <>
            <div className="vc-row" style={{ paddingBottom: 8 }}>
                <span className="vc-k">Today</span>
                <span className="vc-sp vc-sm">{s.day}</span>
            </div>
            {(s.today ?? []).map((r) => (
                <div
                    key={r.time + r.name}
                    className="vc-row"
                    style={{ padding: "8px 0", borderTop: LINE, fontSize: 13 }}
                >
                    <span className="vc-b" style={{ width: 40 }}>
                        {r.time}
                    </span>
                    <span>
                        {r.name} · <span className="vc-sm">{r.who}</span>
                    </span>
                    <Pill tone={r.status.tone} text={r.status.text} />
                </div>
            ))}
        </>
    );
}

function CustomerCard({ s }: { s: Scene }) {
    const c = s.customer;
    return (
        <>
            <div className="vc-row">
                <span
                    className="vc-av"
                    style={{ width: 36, height: 36, fontSize: 13 }}
                >
                    {c.initials}
                </span>
                <span style={{ fontSize: 13.5 }}>
                    <span className="vc-b">{c.name}</span>
                    <br />
                    <span className="vc-sm">{c.stats.join(" · ")}</span>
                </span>
            </div>
            <div
                style={{
                    background: V("amber-tint"),
                    color: V("amber-deep"),
                    borderRadius: 9,
                    padding: "8px 10px",
                    fontSize: 13,
                    fontWeight: 600,
                }}
            >
                {c.tag}
            </div>
            <div
                className="vc-card"
                style={{ padding: "8px 10px", fontSize: 13, lineHeight: 1.45 }}
            >
                {c.note}
                <br />
                <span className="vc-sm">{c.noteBy}</span>
            </div>
        </>
    );
}

/** The sample GST number every drawn bill shows (Sample data never real). */
export const SAMPLE_GSTIN = "29AAAAA0000A1ZY";

function GstBill({ s }: { s: Scene }) {
    const b = s.bill;
    const half = b.rate / 2;
    return (
        <div
            className="vc-card"
            style={{
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                fontSize: 12.5,
            }}
        >
            <div className="vc-row">
                <span className="vc-b" style={{ fontSize: 13.5 }}>
                    Bill #{b.no}
                </span>
                <Pill tone={b.status.tone} text={b.status.text} />
            </div>
            <span className="vc-sm" style={{ fontSize: 11.5 }}>
                {s.business}
                {b.gstin ? ` · GST ${SAMPLE_GSTIN}` : ""}
            </span>
            {b.lines.map((l, i) => (
                <div
                    key={l.name}
                    className="vc-row"
                    style={
                        i === 0
                            ? { borderTop: LINE_SOFT, paddingTop: 6 }
                            : undefined
                    }
                >
                    <span>
                        {l.name}
                        {b.showCodes ? (
                            <>
                                {" "}
                                <span className="vc-sm">{l.code}</span>
                            </>
                        ) : null}
                    </span>
                    <span className="vc-sp">{rupee(l.amount, true)}</span>
                </div>
            ))}
            {b.rate ? (
                <>
                    <div className="vc-row vc-sm">
                        <span>CGST {pct(half)}</span>
                        <span className="vc-sp">{rupee(b.cgst, true)}</span>
                    </div>
                    <div className="vc-row vc-sm">
                        <span>SGST {pct(half)}</span>
                        <span className="vc-sp">{rupee(b.sgst, true)}</span>
                    </div>
                </>
            ) : (
                <div className="vc-row vc-sm">
                    <span>GST</span>
                    <span className="vc-sp">{b.noGst}</span>
                </div>
            )}
            <div
                className="vc-row vc-b"
                style={{ borderTop: LINE_SOFT, paddingTop: 6 }}
            >
                <span>Total</span>
                <span className="vc-sp">{rupee(b.total, true)}</span>
            </div>
            {b.foot ? (
                <span className="vc-sm" style={{ fontSize: 11.5 }}>
                    {b.foot}
                </span>
            ) : null}
        </div>
    );
}

/** The business's own website: its price list or timetable; a Book button only where customers can book. */
function WebsiteList({ p }: { p: SearchPageData }) {
    const s = p.scene;
    const button = PRESETS[p.shape].button;
    const rows = s.items.map((x) =>
        p.shape === "classes"
            ? {
                  n: `${x.time ?? ""} ${x.name}`,
                  sub:
                      x.places === undefined || x.places === ""
                          ? x.len
                          : x.places,
              }
            : { n: x.name, sub: x.len },
    );
    return (
        <div className="vc-card" style={{ overflow: "hidden" }}>
            <div
                className="vc-row"
                style={{ padding: "8px 12px", borderBottom: LINE_SOFT }}
            >
                <span className="vc-b" style={{ fontSize: 13 }}>
                    {s.business}
                </span>
                {button ? (
                    <span
                        className="vc-sp"
                        style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: V("ink"),
                            color: V("paper"),
                            padding: "3px 9px",
                            borderRadius: 6,
                        }}
                    >
                        {button}
                    </span>
                ) : (
                    <span className="vc-sp vc-sm" style={{ fontSize: 11.5 }}>
                        {s.site}
                    </span>
                )}
            </div>
            <div style={{ padding: "4px 12px 6px", fontSize: 12.5 }}>
                {rows.map((r, i) => (
                    <div
                        key={r.n}
                        className="vc-row"
                        style={
                            i === 0
                                ? { padding: "5px 0" }
                                : { padding: "5px 0", borderTop: LINE_SOFT }
                        }
                    >
                        <span style={{ minWidth: 0 }}>
                            {r.n}{" "}
                            <span
                                className="vc-sm"
                                style={{ whiteSpace: "nowrap" }}
                            >
                                {r.sub}
                            </span>
                        </span>
                        <span
                            className="vc-sp vc-b"
                            style={{ whiteSpace: "nowrap" }}
                        >
                            {rupee(s.items[i]?.price ?? 0)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Dots({
    size,
    used,
    cols,
    px,
}: {
    size: number;
    used: number;
    cols: number;
    px: number;
}) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 5,
            }}
        >
            {Array.from({ length: size }, (_, k) => (
                <span
                    key={k}
                    style={{
                        boxSizing: "content-box",
                        height: px,
                        borderRadius: 999,
                        background: k < used ? V("ink") : V("white"),
                        border: `1px solid ${k < used ? V("ink") : V("line")}`,
                    }}
                />
            ))}
        </div>
    );
}

function PackCard({ s }: { s: Scene }) {
    const pk = s.pack;
    if (!pk) return null;
    return (
        <>
            <span className="vc-sm vc-b" style={{ color: V("ink") }}>
                {pk.size} classes · {rupee(pk.price)}{" "}
                <span style={{ fontWeight: 400, color: V("muted") }}>
                    {rupee(pk.price / pk.size)} a class
                </span>
            </span>
            <Dots
                size={pk.size}
                used={pk.size - pk.left}
                cols={pk.size}
                px={12}
            />
            <div
                className="vc-card vc-row"
                style={{ padding: "10px 12px", marginTop: 4 }}
            >
                <span style={{ fontSize: 13 }}>
                    <span className="vc-b">{pk.name}</span>
                    <br />
                    <span className="vc-sm">
                        {pk.left} of {pk.size} left
                    </span>
                </span>
                <span className="vc-sp vc-pill vc-paid">Paid</span>
            </div>
        </>
    );
}

function ProductStock({ s }: { s: Scene }) {
    const st = s.stock;
    if (!st) return null;
    const c = st.counted;
    return (
        <>
            <div
                className="vc-card"
                style={{
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                }}
            >
                <div className="vc-row">
                    <span className="vc-b" style={{ fontSize: 13 }}>
                        {st.made.name}
                    </span>
                    <span className="vc-sp vc-sm">Made to order</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {st.made.sizes.map((z) => (
                        <span
                            key={z.size}
                            className="vc-who"
                        >{`${z.size} · ${rupee(z.price)}`}</span>
                    ))}
                </div>
            </div>
            <div className="vc-card vc-row" style={{ padding: "10px 12px" }}>
                <span style={{ fontSize: 13 }}>
                    <span className="vc-b">{c.name}</span>
                    <br />
                    <span className="vc-sm">{`${c.sub} · ${rupee(c.price)} · ${c.line ?? `${c.baked ?? 0} baked today`}`}</span>
                </span>
                <Pill tone="amb" text={`${c.left} left`} />
            </div>
        </>
    );
}

export function SmallPicture({ k, p }: { k: SmallKey; p: SearchPageData }) {
    const s = p.scene;
    switch (k) {
        case "deposit":
            return <DepositPicker s={s} />;
        case "today":
            return <TodayList s={s} />;
        case "customer":
            return <CustomerCard s={s} />;
        case "bill":
            return <GstBill s={s} />;
        case "website":
            return <WebsiteList p={p} />;
        case "pack":
            return <PackCard s={s} />;
        case "stock":
            return <ProductStock s={s} />;
    }
}

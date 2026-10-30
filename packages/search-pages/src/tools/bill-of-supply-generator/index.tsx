"use client";

import type { Parties } from "../_documents/logic";
import { untouched } from "../_documents/logic";
import {
    CustomerSet,
    DocDate,
    DocGate,
    DocNote,
    DocNumber,
    DocSet,
    DocTool,
    LinesEditor,
    Paper,
    PaperEmpty,
    Small,
    Tc,
    useDraft,
    YouSet,
} from "../_documents/parts";
import { Chips } from "../parts";
import type { BillForm } from "./logic";
import { billOfSupply, NUMBER_PLACEHOLDER, START, WHY, WORDS } from "./logic";

/**
 * /tools/bill-of-supply-generator (design BillOfSupply*.dc.html): a bill
 * with no GST on it, drawn as they type, free; the PDF is behind the email
 * gate. Kept in this browser only, so the email's link brings it back.
 */
export default function BillOfSupplyGenerator() {
    const [f, setF] = useDraft<BillForm>(
        "saroh-tool:bill-of-supply-generator",
        START,
    );
    const set = (patch: Partial<BillForm>) => setF({ ...f, ...patch });
    const setParties = (patch: Partial<Parties>) => set(patch);
    const { paper, words, declaration } = billOfSupply(f);

    return (
        <DocTool
            formLabel={WORDS.form}
            label={WORDS.aside}
            form={
                <>
                    <YouSet
                        v={f}
                        set={setParties}
                        gstinHint={WORDS.gstinHint}
                    />
                    <DocSet legend={WORDS.whySet}>
                        <Chips
                            legend={WORDS.why}
                            options={WHY}
                            value={f.why}
                            onChange={(why) => set({ why })}
                            hint={
                                <>
                                    {WORDS.whyHint} <Tc />
                                </>
                            }
                        />
                    </DocSet>
                    <CustomerSet v={f} set={setParties} />
                    <DocSet legend={WORDS.set} cols={2}>
                        <DocNumber
                            label={WORDS.number}
                            value={f.number}
                            placeholder={NUMBER_PLACEHOLDER}
                            hint={
                                <>
                                    {WORDS.numberHint} <Tc />
                                </>
                            }
                            onChange={(number) => set({ number })}
                        />
                        <DocDate
                            label={WORDS.date}
                            value={f.date}
                            onChange={(date) => set({ date })}
                        />
                    </DocSet>
                    <DocSet legend={WORDS.lines}>
                        <LinesEditor
                            lines={f.lines}
                            onChange={(lines) => set({ lines })}
                            placeholder={{
                                item: "What you sold",
                                code: "1905",
                                rate: "950",
                            }}
                        />
                        <a
                            className="td-find"
                            href="/tools/hsn-sac-code-finder"
                        >
                            {WORDS.find}
                        </a>
                    </DocSet>
                </>
            }
        >
            {untouched(f.name, f.lines) ? (
                <PaperEmpty>{WORDS.empty}</PaperEmpty>
            ) : (
                <>
                    <Paper {...paper}>
                        <div className="td-words">{words}</div>
                        {declaration ? (
                            <DocNote>
                                {declaration}
                                {f.why === "exempt" ? (
                                    <>
                                        {" "}
                                        <Tc />
                                    </>
                                ) : null}
                            </DocNote>
                        ) : null}
                    </Paper>
                    <Small>
                        {declaration ? (
                            <>
                                {WORDS.noGst}{" "}
                                <a href="/tools/gst-invoice-generator">
                                    {WORDS.useInvoice}
                                </a>
                                .
                            </>
                        ) : (
                            <>
                                {WORDS.plain} <Tc />
                            </>
                        )}
                    </Small>
                    <DocGate what="bill" file={paper.num} />
                </>
            )}
        </DocTool>
    );
}

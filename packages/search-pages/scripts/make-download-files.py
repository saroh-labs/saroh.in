#!/usr/bin/env python3
"""Makes the free downloads' files (content/downloads/files/<slug>/*), once.

The repo has no .xlsx/.docx/.pdf library and we don't add one for a handful
of files (plan 2026-10-31-002, "Files are committed, not generated at
build"). So this writes minimal Office Open XML and PDF by hand, with
Python's standard library only. It is not part of any build: run it after
changing what a file holds, check the files open, and commit them.

    python3 -I packages/search-pages/scripts/make-download-files.py
    pnpm --filter @saroh/search-pages docs-content   # the sizes change

Each run writes the same bytes (fixed zip dates), and checks what it wrote:
every zip part parses as XML and the PDF's offsets point at its objects.
Sample data is fictional: GSTIN 29AAAAA0000A1ZY, example.com emails.
"""

import re
import zipfile
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from pathlib import Path
from xml.dom.minidom import parseString
from xml.sax.saxutils import escape

FILES = Path(__file__).resolve().parent.parent / "content" / "downloads" / "files"
MADE_WITH = "Made with Saroh · saroh.in"
GSTIN = "29AAAAA0000A1ZY"
DATE = "24 Oct 2026"
ZIP_DATE = (2026, 10, 31, 0, 0, 0)

SALON = {
    "name": "Lotus Hair Studio",
    "address": "12 Lake View Road, Indiranagar, Bengaluru 560038",
    "gstin": GSTIN,
    "state": 29,
    "state_name": "Karnataka",
}
CUSTOMER = {
    "name": "Priya Nair",
    "address": "Koramangala, Bengaluru 560034",
    "gstin": "",
    "mobile": "+91 90000 00001",
}

# ---------------------------------------------------------------- the sums
# The GST invoice generator's rules (src/tools/_documents/logic.ts): each
# line's tax rounded to the paisa; in the seller's state half CGST, half
# SGST, an odd paisa to CGST; in another state IGST.

P = Decimal("0.01")


def tax_split(taxable, rate, same_state):
    tax = (Decimal(taxable) * Decimal(rate) / 100).quantize(P, ROUND_HALF_UP)
    if not same_state:
        return Decimal(0), Decimal(0), tax
    sgst = (tax / 2).quantize(P, ROUND_DOWN)
    return tax - sgst, sgst, Decimal(0)


ONES = [""] + ("one two three four five six seven eight nine ten eleven twelve "
               "thirteen fourteen fifteen sixteen seventeen eighteen nineteen").split(" ")
TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" ")


def under100(n):
    if n < 20:
        return ONES[n]
    return f"{TENS[n // 10]}-{ONES[n % 10]}" if n % 10 else TENS[n // 10]


def indian_words(n):
    if n == 0:
        return "zero"
    parts = []
    crore, lakh = n // 10_000_000, n % 10_000_000 // 100_000
    thousand, hundred, rest = n % 100_000 // 1000, n % 1000 // 100, n % 100
    if crore:
        parts.append(f"{indian_words(crore)} crore")
    if lakh:
        parts.append(f"{under100(lakh)} lakh")
    if thousand:
        parts.append(f"{under100(thousand)} thousand")
    if hundred:
        parts.append(f"{ONES[hundred]} hundred")
    if rest:
        parts.append(f"and {under100(rest)}" if parts else under100(rest))
    return " ".join(parts)


def amount_in_words(amount):
    """Mirrors amountInWords in _documents/logic.ts."""
    paise = int((Decimal(amount) * 100).quantize(Decimal(1)))
    r, p = divmod(paise, 100)
    tail = f" and {under100(p)} paise" if p else ""
    return f"Rupees {indian_words(r)}{tail} only"


assert amount_in_words(1430) == "Rupees one thousand four hundred and thirty only"
assert amount_in_words(4095) == "Rupees four thousand and ninety-five only"
assert tax_split(125, 5, True) == (Decimal("3.13"), Decimal("3.12"), 0)


def rupees(d):
    return f"₹{Decimal(d):,.2f}"


# The examples beside each blank form.
GST_LINES = [
    ("Haircut and styling", "999721", 1, 800, 5),
    ("Hair colour, full head", "999721", 1, 2500, 5),
    ("Manicure", "999722", 1, 600, 5),
]
BOS_SELLER = {**SALON, "name": "Kaveri Bakery",
              "address": "4th Block, Jayanagar, Bengaluru 560011"}
BOS_CUSTOMER = {"name": "Rahul Menon", "address": "Jayanagar, Bengaluru 560041",
                "gstin": ""}
BOS_LINES = [
    ("Butter cookies, 250 g box", "1905", 4, 120),
    ("Plum cake, 500 g", "1905", 2, 350),
]
RECEIPT_LINES = [("Haircut and styling", 800), ("Manicure", 600)]
COMPOSITION = "Composition taxable person, not eligible to collect tax on supplies."
EXEMPT = "Supply exempt from GST."
CUSTOMERS = [
    ("Name", "Phone", "Email", "City", "Last visit", "Notes"),
    ("Priya Nair", "+91 90000 00001", "priya.nair@example.com", "Bengaluru",
     "2026-10-20", "Hair colour every 6 weeks"),
    ("Rahul Menon", "+91 90000 00002", "rahul.menon@example.com", "Bengaluru",
     "2026-10-12", ""),
]

# ---------------------------------------------------------------- zips


def write_zip(path, parts):
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in parts.items():
            z.writestr(zipfile.ZipInfo(name, ZIP_DATE), text.encode("utf-8"),
                       zipfile.ZIP_DEFLATED)


XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def rels(items):
    rows = "".join(f'<Relationship Id="{i}" Type="{REL}/{t}" Target="{target}"/>'
                   for i, t, target in items)
    return f'{XML}<Relationships xmlns="{PKG_REL}">{rows}</Relationships>'


def content_types(overrides):
    rows = "".join(f'<Override PartName="{p}" ContentType="{t}"/>' for p, t in overrides)
    return (f'{XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f"{rows}</Types>")


# ---------------------------------------------------------------- xlsx

class F:
    """A formula and the value it gives, so every app shows it before recalculating."""

    def __init__(self, f, v):
        self.f, self.v = f, v


# Cell styles (cellXfs below, by position).
S_TEXT, S_BOLD, S_TITLE, S_MONEY, S_MONEY_BOLD, S_GREY, S_IN, S_IN_MONEY, S_HEAD, S_OUT_MONEY, S_IN_NUM = range(11)

XLSX_STYLES = (
    f'{XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    # A zero shows as empty, so unused lines stay clean.
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;-#,##0.00;&quot;&quot;"/></numFmts>'
    # Arial: on Windows, macOS and in Google Sheets alike (a Mac has no Calibri, so it fell back to a serif).
    '<fonts count="4">'
    '<font><sz val="11"/><name val="Arial"/><family val="2"/></font>'
    '<font><b/><sz val="11"/><name val="Arial"/><family val="2"/></font>'
    '<font><b/><sz val="18"/><name val="Arial"/><family val="2"/></font>'
    '<font><sz val="9"/><color rgb="FF6B7280"/><name val="Arial"/><family val="2"/></font>'
    "</fonts>"
    '<fills count="4"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>'
    "</fills>"
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    '<border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right>'
    '<top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>'
    "</borders>"
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="11">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="49" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    "</cellXfs>"
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    "</styleSheet>"
)


def col_num(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


class Sheet:
    def __init__(self, name, widths, fit=False):
        """`fit`: print on one page."""
        self.name, self.widths, self.cells, self.fit = name, widths, {}, fit

    def put(self, ref, value, style=S_TEXT):
        self.cells[ref] = (value, style)


def sheet_xml(sheet, strings):
    rows = {}
    for ref, cell in sheet.cells.items():
        letters, row = re.match(r"([A-Z]+)(\d+)$", ref).groups()
        rows.setdefault(int(row), []).append((col_num(letters), ref, cell))
    out = []
    for r in sorted(rows):
        cells = []
        for _, ref, (v, s) in sorted(rows[r]):
            if isinstance(v, F):
                cells.append(f'<c r="{ref}" s="{s}"><f>{escape(v.f)}</f><v>{v.v}</v></c>')
            elif isinstance(v, str):
                if v not in strings:
                    strings[v] = len(strings)
                cells.append(f'<c r="{ref}" s="{s}" t="s"><v>{strings[v]}</v></c>')
            elif v is None:
                cells.append(f'<c r="{ref}" s="{s}"/>')
            else:
                cells.append(f'<c r="{ref}" s="{s}"><v>{v}</v></c>')
        out.append(f'<row r="{r}">{"".join(cells)}</row>')
    cols = "".join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>'
                   for i, w in enumerate(sheet.widths, 1))
    footer = escape(f"&C{MADE_WITH}")
    pr = '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' if sheet.fit else ""
    fit = 'fitToWidth="1" fitToHeight="1"' if sheet.fit else 'fitToHeight="0"'
    return (f'{XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'{pr}<cols>{cols}</cols><sheetData>{"".join(out)}</sheetData>'
            '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
            f'<pageSetup paperSize="9" orientation="landscape" {fit}/>'
            f"<headerFooter><oddFooter>{footer}</oddFooter></headerFooter></worksheet>")


def write_xlsx(path, sheets):
    strings = {}
    parts = {f"xl/worksheets/sheet{i}.xml": sheet_xml(s, strings)
             for i, s in enumerate(sheets, 1)}
    sst = "".join(f'<si><t xml:space="preserve">{escape(s)}</t></si>' for s in strings)
    names = "".join(f'<sheet name="{escape(s.name)}" sheetId="{i}" r:id="rId{i}"/>'
                    for i, s in enumerate(sheets, 1))
    n = len(sheets)
    main = "application/vnd.openxmlformats-officedocument.spreadsheetml"
    write_zip(path, {
        "[Content_Types].xml": content_types(
            [("/xl/workbook.xml", f"{main}.sheet.main+xml"),
             ("/xl/styles.xml", f"{main}.styles+xml"),
             ("/xl/sharedStrings.xml", f"{main}.sharedStrings+xml")]
            + [(f"/xl/worksheets/sheet{i}.xml", f"{main}.worksheet+xml") for i in range(1, n + 1)]),
        "_rels/.rels": rels([("rId1", "officeDocument", "xl/workbook.xml")]),
        "xl/workbook.xml": (
            f'{XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="{REL}">'
            f'<sheets>{names}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>'),
        "xl/_rels/workbook.xml.rels": rels(
            [(f"rId{i}", "worksheet", f"worksheets/sheet{i}.xml") for i in range(1, n + 1)]
            + [(f"rId{n + 1}", "styles", "styles.xml"), (f"rId{n + 2}", "sharedStrings", "sharedStrings.xml")]),
        "xl/styles.xml": XLSX_STYLES,
        "xl/sharedStrings.xml": (
            f'{XML}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            f'count="{len(strings)}" uniqueCount="{len(strings)}">{sst}</sst>'),
        **parts,
    })


def fields(sh, rows, col, ex):
    """Label in `col`, the yellow cell to type in beside it."""
    val = chr(ord(col) + 1)
    for r, label, key in rows:
        sh.put(f"{col}{r}", label, S_BOLD)
        v = ex.get(key) if ex else None
        sh.put(f"{val}{r}", v if v not in (None, "") else None,
               S_IN_NUM if isinstance(v, int) or key.endswith("state") else S_IN)


INVOICE_LINES = 10


def gst_invoice_sheet(name, ex):
    """A tax invoice whose CGST, SGST, IGST and totals are formulas."""
    # A holds the labels ("GSTIN (if they have one)") and the line numbers: wide enough for the labels.
    sh = Sheet(name, [24, 30, 12, 8, 12, 15, 9, 12, 12, 12, 14], fit=True)
    sh.put("A1", "Tax invoice", S_TITLE)
    sh.put("A2", "Type in the yellow cells. The tax and the totals work themselves out.", S_GREY)
    seller, cust = (ex or {}).get("seller", {}), (ex or {}).get("customer", {})
    sh.put("A4", "From", S_BOLD)
    fields(sh, [(5, "Business name", "name"), (6, "Address", "address"),
                (7, "GSTIN", "gstin"), (8, "State code", "state")], "A", seller)
    sh.put("C8", seller.get("state_name") if ex else None, S_IN)
    sh.put("E4", "Invoice", S_BOLD)
    inv = {"number": ex["number"], "date": DATE, "pos": 29, "rc": "No"} if ex else {}
    for r, label, key in [(5, "Invoice number", "number"), (6, "Invoice date", "date"),
                          (7, "Place of supply (state code)", "pos"), (8, "Reverse charge", "rc")]:
        sh.put(f"E{r}", label, S_BOLD)
        sh.put(f"H{r}", inv.get(key), S_IN_NUM if key == "pos" else S_IN)
    sh.put("I7", "Karnataka" if ex else None, S_IN)
    sh.put("A10", "Billed to", S_BOLD)
    fields(sh, [(11, "Customer name", "name"), (12, "Address", "address"),
                (13, "GSTIN (if they have one)", "gstin")], "A", cust)
    sh.put("A14", "Same state code in B8 and H7: CGST and SGST, half the rate each. "
                  "Another state: IGST at the full rate.", S_GREY)
    heads = ["#", "Item or service", "HSN/SAC", "Qty", "Rate (₹)", "Taxable value (₹)",
             "GST %", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total (₹)"]
    for i, h in enumerate(heads):
        sh.put(f"{chr(65 + i)}16", h, S_HEAD)
    first, last = 17, 16 + INVOICE_LINES
    same = "$B$8=$H$7"
    sums = {k: Decimal(0) for k in "FHIJK"}
    lines = (ex or {}).get("lines", [])
    for i in range(INVOICE_LINES):
        r = first + i
        item, code, qty, rate, gst = lines[i] if i < len(lines) else (None, None, None, None, None)
        taxable = Decimal(qty * rate) if item else Decimal(0)
        c, s, ig = tax_split(taxable, gst, True) if item else (0, 0, 0)
        total = taxable + c + s + ig
        for k, v in zip("FHIJK", (taxable, c, s, ig, total)):
            sums[k] += v
        sh.put(f"A{r}", i + 1)
        sh.put(f"B{r}", item, S_IN)
        sh.put(f"C{r}", code, S_IN)
        sh.put(f"D{r}", qty, S_IN_NUM)
        sh.put(f"E{r}", rate, S_IN_MONEY)
        sh.put(f"F{r}", F(f"D{r}*E{r}", taxable), S_OUT_MONEY)
        sh.put(f"G{r}", gst, S_IN_NUM)
        tax = f"ROUND(F{r}*G{r}/100,2)"
        sh.put(f"I{r}", F(f"IF({same},ROUNDDOWN({tax}/2,2),0)", s), S_OUT_MONEY)
        # An odd paisa goes to CGST, as Saroh's invoices do.
        sh.put(f"H{r}", F(f"IF({same},{tax}-I{r},0)", c), S_OUT_MONEY)
        sh.put(f"J{r}", F(f"IF({same},0,{tax})", ig), S_OUT_MONEY)
        sh.put(f"K{r}", F(f"F{r}+H{r}+I{r}+J{r}", total), S_OUT_MONEY)
    t = last + 2
    for j, (label, k) in enumerate([("Taxable value", "F"), ("CGST", "H"), ("SGST", "I"),
                                    ("IGST", "J"), ("Total", "K")]):
        bold = k == "K"
        sh.put(f"I{t + j}", label, S_BOLD if bold else S_TEXT)
        sh.put(f"K{t + j}", F(f"SUM({k}{first}:{k}{last})", sums[k]),
               S_MONEY_BOLD if bold else S_MONEY)
    sh.put(f"A{t}", "Amount in words", S_BOLD)
    sh.put(f"B{t + 1}", amount_in_words(sums["K"]) if ex else None, S_IN)
    sh.put(f"A{t + 6}", "Authorised signatory", S_BOLD)
    sh.put(f"A{t + 9}", MADE_WITH, S_GREY)
    return sh


def bill_of_supply_sheet(name, ex):
    """A bill of supply: no GST, the total, and the line the rules ask for."""
    sh = Sheet(name, [24, 32, 12, 8, 12, 15], fit=True)
    sh.put("A1", "Bill of supply", S_TITLE)
    sh.put("A2", "Type in the yellow cells. The amounts and the total work themselves out.", S_GREY)
    seller, cust = (ex or {}).get("seller", {}), (ex or {}).get("customer", {})
    sh.put("A4", "From", S_BOLD)
    fields(sh, [(5, "Business name", "name"), (6, "Address", "address"), (7, "GSTIN", "gstin")], "A", seller)
    sh.put("D4", "Bill", S_BOLD)
    for r, label, v in [(5, "Bill number", ex and ex["number"]), (6, "Bill date", ex and DATE)]:
        sh.put(f"D{r}", label, S_BOLD)
        sh.put(f"F{r}", v or None, S_IN)
    sh.put("A9", "Billed to", S_BOLD)
    fields(sh, [(10, "Customer name", "name"), (11, "Address", "address"),
                (12, "GSTIN (if they have one)", "gstin")], "A", cust)
    for i, h in enumerate(["#", "Item or service", "HSN/SAC", "Qty", "Rate (₹)", "Amount (₹)"]):
        sh.put(f"{chr(65 + i)}14", h, S_HEAD)
    first, last = 15, 14 + INVOICE_LINES
    lines, total = (ex or {}).get("lines", []), Decimal(0)
    for i in range(INVOICE_LINES):
        r = first + i
        item, code, qty, rate = lines[i] if i < len(lines) else (None, None, None, None)
        amount = Decimal(qty * rate) if item else Decimal(0)
        total += amount
        sh.put(f"A{r}", i + 1)
        sh.put(f"B{r}", item, S_IN)
        sh.put(f"C{r}", code, S_IN)
        sh.put(f"D{r}", qty, S_IN_NUM)
        sh.put(f"E{r}", rate, S_IN_MONEY)
        sh.put(f"F{r}", F(f"D{r}*E{r}", amount), S_OUT_MONEY)
    t = last + 2
    sh.put(f"E{t}", "Total", S_BOLD)
    sh.put(f"F{t}", F(f"SUM(F{first}:F{last})", total), S_MONEY_BOLD)
    sh.put(f"A{t}", "Amount in words", S_BOLD)
    sh.put(f"B{t + 1}", amount_in_words(total) if ex else None, S_IN)
    sh.put(f"A{t + 3}", "Declaration", S_BOLD)
    sh.put(f"B{t + 3}", COMPOSITION, S_IN)
    sh.put(f"B{t + 4}", f"Selling exempt goods or services? Write instead: {EXEMPT}", S_GREY)
    sh.put(f"A{t + 7}", "Authorised signatory", S_BOLD)
    sh.put(f"A{t + 10}", MADE_WITH, S_GREY)
    return sh


def customer_sheets():
    sh = Sheet("Customers", [22, 18, 28, 14, 12, 30])
    for r, row in enumerate(CUSTOMERS, 1):
        for i, v in enumerate(row):
            sh.put(f"{chr(65 + i)}{r}", v or None, S_HEAD if r == 1 else S_IN)
    about = Sheet("Read me", [90])
    for r, (v, s) in enumerate([
        ("Customer list", S_TITLE),
        ("One row for each customer. Replace the two example rows with your own.", S_TEXT),
        ("Last visit is a date: year, month, day (2026-10-20).", S_TEXT),
        ("To import the list into Saroh later, save the Customers sheet as CSV. Each customer needs an email.", S_TEXT),
        (MADE_WITH, S_GREY),
    ], 1):
        about.put(f"A{r}", v, s)
    return [sh, about]


# ---------------------------------------------------------------- docx

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
GREY = "6B7280"


def run(text, bold=False, size=None, color=None):
    props = ("<w:b/>" if bold else "") + (f'<w:color w:val="{color}"/>' if color else "") \
        + (f'<w:sz w:val="{size * 2}"/>' if size else "")
    rpr = f"<w:rPr>{props}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def para(text="", bold=False, size=None, color=None, align=None, after=120):
    ppr = f'<w:spacing w:before="0" w:after="{after}"/>' + (f'<w:jc w:val="{align}"/>' if align else "")
    return f"<w:p><w:pPr>{ppr}</w:pPr>{run(text, bold, size, color) if text else ''}</w:p>"


PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
BORDER = "".join(f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>'
                 for s in ("top", "left", "bottom", "right", "insideH", "insideV"))


def table(rows, widths, head=False, bold_cols=(), height=360, right_cols=(), align=""):
    """Rows of cell text; `head` shades the first row."""
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    out = []
    for ri, row in enumerate(rows):
        cells = []
        for ci, (text, w) in enumerate(zip(row, widths)):
            shade = '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>' if head and ri == 0 else ""
            jc = '<w:jc w:val="right"/>' if ci in right_cols and ri > 0 else ""
            b = (head and ri == 0) or ci in bold_cols
            cells.append(f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{shade}</w:tcPr>'
                         f'<w:p><w:pPr><w:spacing w:before="40" w:after="40"/>{jc}</w:pPr>'
                         f'{run(text, b) if text else ""}</w:p></w:tc>')
        out.append(f'<w:tr><w:trPr><w:trHeight w:val="{height}"/></w:trPr>{"".join(cells)}</w:tr>')
    jc = f'<w:jc w:val="{align}"/>' if align else ""
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/>{jc}<w:tblBorders>{BORDER}</w:tblBorders>'
            f'<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(out)}</w:tbl>')


def write_docx(path, body):
    footer = (f'{XML}<w:ftr xmlns:w="{W}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
              f'{run(MADE_WITH, size=8, color=GREY)}</w:p></w:ftr>')
    styles = (f'{XML}<w:styles xmlns:w="{W}"><w:docDefaults><w:rPrDefault><w:rPr>'
              '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>'
              '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault>'
              '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
              '</w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
              "</w:styles>")
    # A4, 2 cm margins.
    sect = ('<w:sectPr><w:footerReference w:type="default" r:id="rId2"/>'
            '<w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>'
            "</w:sectPr>")
    main = "application/vnd.openxmlformats-officedocument.wordprocessingml"
    write_zip(path, {
        "[Content_Types].xml": content_types([
            ("/word/document.xml", f"{main}.document.main+xml"),
            ("/word/styles.xml", f"{main}.styles+xml"),
            ("/word/footer1.xml", f"{main}.footer+xml")]),
        "_rels/.rels": rels([("rId1", "officeDocument", "word/document.xml")]),
        "word/_rels/document.xml.rels": rels([("rId1", "styles", "styles.xml"),
                                              ("rId2", "footer", "footer1.xml")]),
        "word/document.xml": (f'{XML}<w:document xmlns:w="{W}" xmlns:r="{REL}"><w:body>'
                              f'{"".join(body)}{sect}</w:body></w:document>'),
        "word/styles.xml": styles,
        "word/footer1.xml": footer,
    })


PAGE_W = 9638  # A4 less 2 cm margins, in twentieths of a point


def doc_parties(title, number_label, seller, customer, extra):
    """The title, who it's from and to, and the document's own fields."""
    s, c = seller or {}, customer or {}
    left = [("Business name", s.get("name")), ("Address", s.get("address")),
            ("GSTIN", s.get("gstin")),
            ("State and code", s and f"{s['state_name']}, {s['state']}")]
    right = [(number_label, s and extra.get("number")), ("Date", s and DATE)] + extra.get("right", [])
    while len(right) < len(left):
        right.append(("", ""))
    w = [1900, 2919, 1900, 2919]
    rows = [[a, b or "", x, y or ""] for (a, b), (x, y) in zip(left, right)]
    to = [["Customer name", c.get("name") or ""], ["Address", c.get("address") or ""],
          ["GSTIN (if they have one)", c.get("gstin") or ""]]
    return [para(title, bold=True, size=20, after=200), para("From", bold=True),
            table(rows, w, bold_cols=(0, 2)), para(after=80), para("Billed to", bold=True),
            table(to, [3000, PAGE_W - 3000], bold_cols=(0,)), para(after=80)]


def doc_lines(heads, widths, lines, right_cols, n=8):
    rows = [heads] + [[str(i + 1)] + (lines[i] if i < len(lines) else [""] * (len(heads) - 1))
                      for i in range(max(n, len(lines)))]
    return table(rows, widths, head=True, right_cols=right_cols)


def sums_table(rows):
    return table(rows, [2400, 2000], bold_cols=(0,), right_cols=(1,), height=320, align="right")


def gst_invoice_doc(ex):
    lines, sums = [], {k: Decimal(0) for k in ("t", "c", "s", "i")}
    for item, code, qty, rate, gst in (ex or {}).get("lines", []):
        taxable = Decimal(qty * rate)
        c, s, i = tax_split(taxable, gst, True)
        for k, v in zip("tcsi", (taxable, c, s, i)):
            sums[k] += v
        lines.append([item, code, str(qty), f"{rate:,.2f}", f"{taxable:,.2f}", f"{gst}%"])
    total = sum(sums.values())
    val = (lambda d: rupees(d)) if ex else (lambda d: "")
    return [
        *doc_parties("Tax invoice", "Invoice number", ex and SALON, ex and CUSTOMER,
                     {"number": ex and ex["number"], "right": [
                         ("Place of supply", ex and "Karnataka, 29"), ("Reverse charge", ex and "No")]}),
        doc_lines(["#", "Item or service", "HSN/SAC", "Qty", "Rate (₹)", "Taxable value (₹)", "GST rate"],
                  [500, 3338, 1100, 700, 1300, 1600, 1100], lines, right_cols=(3, 4, 5, 6)),
        para(after=80),
        sums_table([["Taxable value", val(sums["t"])], ["CGST", val(sums["c"])], ["SGST", val(sums["s"])],
                    ["IGST", val(sums["i"])], ["Total", val(total)]]),
        para(after=80),
        para("Amount in words", bold=True, after=40),
        para(amount_in_words(total) if ex else "_" * 80),
        para("Same state as the place of supply: CGST and SGST, half the rate each. "
             "Another state: IGST at the full rate.", size=8, color=GREY, after=480),
        para("Authorised signatory", bold=True),
    ]


def bill_of_supply_doc(ex):
    lines, total = [], Decimal(0)
    for item, code, qty, rate in (ex or {}).get("lines", []):
        total += qty * rate
        lines.append([item, code, str(qty), f"{rate:,.2f}", f"{qty * rate:,.2f}"])
    return [
        *doc_parties("Bill of supply", "Bill number", ex and BOS_SELLER, ex and BOS_CUSTOMER,
                     {"number": ex and ex["number"]}),
        doc_lines(["#", "Item or service", "HSN/SAC", "Qty", "Rate (₹)", "Amount (₹)"],
                  [500, 4238, 1100, 900, 1400, 1500], lines, right_cols=(3, 4, 5)),
        para(after=80),
        sums_table([["Total", rupees(total) if ex else ""]]),
        para(after=80),
        para("Amount in words", bold=True, after=40),
        para(amount_in_words(total) if ex else "_" * 80),
        para("Declaration", bold=True, after=40),
        para(COMPOSITION),
        para(f"Selling exempt goods or services? Write instead: {EXEMPT}", size=8, color=GREY, after=480),
        para("Authorised signatory", bold=True),
    ]


def receipt_doc(ex):
    s = ex and SALON
    total = sum(a for _, a in RECEIPT_LINES)
    rows = [["Business name", s and s["name"], "Receipt number", s and "RCT-0001"],
            ["Address", s and s["address"], "Date", s and DATE],
            ["GSTIN (if registered)", s and s["gstin"], "Received from", s and CUSTOMER["name"]],
            ["", "", "Mobile", s and CUSTOMER["mobile"]]]
    lines = [[item, f"{a:,.2f}"] for item, a in RECEIPT_LINES] if ex else []
    v = (lambda x: x) if ex else (lambda x: "")
    return [
        para("Receipt", bold=True, size=20, after=200),
        table([[a, b or "", c, d or ""] for a, b, c, d in rows], [1900, 2919, 1900, 2919], bold_cols=(0, 2)),
        para(after=80),
        doc_lines(["#", "For (item or service)", "Amount (₹)"], [500, 7138, 2000], lines, right_cols=(2,), n=6),
        para(after=80),
        sums_table([["Total", v(rupees(total))],
                    ["Paid by", v("UPI")],
                    ["Reference", v("412345678901")],
                    ["Amount received", v(rupees(total))],
                    ["Still due", v(rupees(0))]]),
        para("Paid by: cash, UPI, card or bank transfer. Reference: the UPI number, "
             "card approval code or bank UTR.", size=8, color=GREY, after=80),
        para("Amount received in words", bold=True, after=40),
        para(amount_in_words(total) if ex else "_" * 80, after=480),
        para("Received by (signature)", bold=True),
    ]


# ---------------------------------------------------------------- pdf

def pdf_text(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf_ops():
    """A page's drawing list and the pens that add to it (Helvetica, WinAnsi: "Rs." for ₹)."""
    ops = []

    def text(x, y, s, size=10, bold=False, grey=False):
        colour = "0.42 0.45 0.5 rg" if grey else "0 0 0 rg"
        ops.append(f"BT {colour} /{'F2' if bold else 'F1'} {size} Tf {x} {y} Td ({pdf_text(s)}) Tj ET")

    def line(x1, y1, x2, y2):
        ops.append(f"{x1} {y1} m {x2} {y2} l S")

    def rtext(x, y, s, size=10, bold=False):
        # Helvetica digits are 0.556 em wide; close enough to right-align figures.
        text(round(x - len(s) * size * 0.53, 1), y, s, size, bold)

    return ops, text, line, rtext


def receipt_page(ex):
    """One A4 receipt to print and fill in by hand."""
    ops, text, line, rtext = pdf_ops()
    ops.append("0.82 0.84 0.86 RG 0.75 w")
    text(50, 780, "Receipt", 24, bold=True)
    s = SALON if ex else {}
    fields_l = [("Business name", s.get("name")), ("Address", s.get("address")),
                ("GSTIN (if registered)", s.get("gstin"))]
    fields_r = [("Receipt number", ex and "RCT-0001"), ("Date", ex and DATE),
                ("Received from", ex and CUSTOMER["name"]), ("Mobile", ex and CUSTOMER["mobile"])]
    for i, (label, v) in enumerate(fields_l):
        y = 740 - i * 26
        text(50, y, label, 9, bold=True)
        line(160, y - 3, 330, y - 3)
        if v:
            # A long address goes on two lines.
            first, _, rest = v.rpartition(", ") if len(v) > 34 else ("", "", v)
            text(162, y, first or rest, 9)
            if first:
                text(162, y - 11, rest, 9)
    for i, (label, v) in enumerate(fields_r):
        y = 740 - i * 26
        text(350, y, label, 9, bold=True)
        line(440, y - 3, 545, y - 3)
        if v:
            text(442, y, v, 9)
    # The lines.
    top, rh, n = 620, 24, 7
    ops.append("0.95 0.96 0.96 rg 50 %d 495 %d re f" % (top - rh, rh))
    ops.append(f"50 {top - rh * (n + 1)} 495 {rh * (n + 1)} re S")
    for i in range(1, n + 1):
        line(50, top - rh * i, 545, top - rh * i)
    line(80, top, 80, top - rh * (n + 1))
    line(445, top, 445, top - rh * (n + 1))
    text(58, top - 16, "#", 9, bold=True)
    text(88, top - 16, "For (item or service)", 9, bold=True)
    text(453, top - 16, "Amount (Rs.)", 9, bold=True)
    for i in range(n):
        text(60, top - rh * (i + 1) - 16, str(i + 1), 9)
    total = sum(a for _, a in RECEIPT_LINES)
    if ex:
        for i, (item, a) in enumerate(RECEIPT_LINES):
            text(88, top - rh * (i + 1) - 16, item, 10)
            rtext(538, top - rh * (i + 1) - 16, f"{a:,.2f}")
    # The sums.
    y0 = top - rh * (n + 1) - 28
    sums = [("Total (Rs.)", f"{total:,.2f}"), ("Paid by", "UPI"), ("Reference", "412345678901"),
            ("Amount received (Rs.)", f"{total:,.2f}"), ("Still due (Rs.)", "0.00")]
    for i, (label, v) in enumerate(sums):
        y = y0 - i * 24
        text(300, y, label, 9, bold=True)
        line(420, y - 3, 545, y - 3)
        if ex:
            rtext(538, y, v)
    text(50, y0, "Paid by: cash, UPI, card or bank transfer.", 8, grey=True)
    text(50, y0 - 12, "Reference: the UPI number, card approval", 8, grey=True)
    text(50, y0 - 24, "code or bank UTR.", 8, grey=True)
    y = y0 - 5 * 24 - 20
    text(50, y, "Amount received in words", 9, bold=True)
    line(50, y - 22, 545, y - 22)
    if ex:
        text(52, y - 19, amount_in_words(total), 10)
    text(50, y - 80, "Received by (signature)", 9, bold=True)
    line(180, y - 83, 360, y - 83)
    text(229, 30, MADE_WITH, 8, grey=True)
    return "\n".join(ops)


def write_pdf(path, pages, title="Receipt", size=(595, 842)):
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None,
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
            f"<< /Title ({pdf_text(title)}) /Creator (Saroh, saroh.in) >>"]
    kids = []
    for content in pages:
        data = content.encode("cp1252")
        objs.append(f"<< /Length {len(data)} >>\nstream\n{data.decode('cp1252')}\nendstream")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {size[0]} {size[1]}] "
                    f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {len(objs)} 0 R >>")
        kids.append(f"{len(objs)} 0 R")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    out, offsets = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode("cp1252")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))


# ---------------------------------------------------------------- rate card
# A fixed, fill-in version of the salon rate card maker
# (src/tools/salon-rate-card-maker): services by section, time and price.
# The example's prices are the fictional salon's own, never Saroh's.

RATE_CARD_SALON = {"name": "Lotus Hair Studio", "tag": "Hair, skin and nails in Indiranagar",
                   "phone": "+91 90000 00010"}
RATE_CARD = [
    ("Hair", [("Haircut and blow-dry", "45 min", 600), ("Blow-dry", "30 min", 400),
              ("Hair spa", "60 min", 1200), ("Root touch-up", "60 min", 1500),
              ("Global colour", "120 min", 3500)]),
    ("Skin", [("Clean-up", "40 min", 800), ("De-tan", "30 min", 700),
              ("Hydrating facial", "60 min", 1800)]),
    ("Hands and feet", [("Manicure", "30 min", 600), ("Pedicure", "45 min", 800),
                        ("Gel polish", "45 min", 900)]),
    ("Waxing and threading", [("Eyebrow threading", "10 min", 80), ("Full arms wax", "30 min", 450),
                              ("Full legs wax", "45 min", 700)]),
]
OWN_LINES = 2  # empty lines under each section for their own services


def rate_card_page(ex):
    """One A4 rate card: printed names, blank times and prices (the example fills them)."""
    ops, text, line, rtext = pdf_ops()
    ops.append("0.82 0.84 0.86 RG 0.75 w")
    if ex:
        text(50, 780, RATE_CARD_SALON["name"], 24, bold=True)
        text(50, 760, RATE_CARD_SALON["tag"], 11, grey=True)
        text(50, 742, f"Bookings: {RATE_CARD_SALON['phone']}", 10)
    else:
        for i, label in enumerate(["Business name", "Line under the name", "Phone for bookings"]):
            y = 785 - i * 26
            text(50, y, label, 9, bold=True)
            line(170, y - 3, 545, y - 3)
    y = 708
    text(50, y, "Service", 9, bold=True, grey=True)
    text(380, y, "Time", 9, bold=True, grey=True)
    rtext(545, y, "Price (Rs.)", 9, bold=True)
    line(50, y - 6, 545, y - 6)
    y -= 30
    for section, services in RATE_CARD:
        text(50, y, section, 12, bold=True)
        y -= 21
        for name, time, price in services + [("", "", 0)] * (0 if ex else OWN_LINES):
            if name:
                text(62, y, name, 10)
            if ex:
                text(380, y, time, 10)
                rtext(545, y, f"Rs. {price:,}")
            line(50, y - 6, 545, y - 6)
            y -= 21
        y -= 9
    text(229, 30, MADE_WITH, 8, grey=True)
    return "\n".join(ops)


def rate_card_doc(ex):
    head = ([para(RATE_CARD_SALON["name"], bold=True, size=20, after=40),
             para(RATE_CARD_SALON["tag"], color=GREY, after=40),
             para(f"Bookings: {RATE_CARD_SALON['phone']}", after=200)] if ex else
            [para("Rate card", bold=True, size=20, after=200),
             table([["Business name", ""], ["Line under the name", ""], ["Phone for bookings", ""]],
                   [3000, PAGE_W - 3000], bold_cols=(0,)), para(after=80)])
    out = list(head)
    for section, services in RATE_CARD:
        rows = [[name, time if ex else "", f"₹{price:,}" if ex else ""] for name, time, price in services]
        rows += [] if ex else [["", "", ""]] * OWN_LINES
        out += [para(section, bold=True, size=12, after=60),
                table([["Service", "Time", "Price (₹)"]] + rows, [6038, 1800, 1800],
                      head=True, right_cols=(2,), height=320),
                para(after=80)]
    return out


# ---------------------------------------------------------------- appointment book

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
SLOTS = [f"{h}:{m:02d}" for h in range(9, 21) for m in (0, 30)]  # 9:00 to 20:30, ends 21:00
assert len(SLOTS) == 24 and SLOTS[-1] == "20:30"
BOOKINGS = [
    ("Date", "Time", "Client", "Phone", "Service", "Notes"),
    ("2026-11-03", "10:00", "Priya Nair", "+91 90000 00001", "Global colour", "Patch test done"),
    ("2026-11-07", "17:30", "Rahul Menon", "+91 90000 00002", "Haircut and blow-dry", ""),
]
BOOKING_ROWS = 50
S_BOX = S_OUT_MONEY  # bordered, no fill: its number format leaves text as typed


def appointment_sheets():
    week = Sheet("Week", [8] + [18] * len(DAYS), fit=True)
    week.put("A1", "Appointment book", S_TITLE)
    week.put("A2", "Write the client and the service in their slot. "
                   "Their phone and notes go on the Bookings sheet.", S_GREY)
    week.put("A4", "Week of", S_BOLD)
    week.put("B4", None, S_IN)
    week.put("A6", "Time", S_HEAD)
    for i, day in enumerate(DAYS):
        week.put(f"{chr(66 + i)}6", day, S_HEAD)
    for r, slot in enumerate(SLOTS, 7):
        week.put(f"A{r}", slot, S_BOLD)
        for i in range(len(DAYS)):
            week.put(f"{chr(66 + i)}{r}", None, S_BOX)
    week.put(f"A{8 + len(SLOTS)}", MADE_WITH, S_GREY)
    book = Sheet("Bookings", [12, 8, 22, 18, 24, 34])
    for r in range(1, BOOKING_ROWS + 2):
        row = BOOKINGS[r - 1] if r <= len(BOOKINGS) else ("",) * 6
        for i, v in enumerate(row):
            book.put(f"{chr(65 + i)}{r}", v or None, S_HEAD if r == 1 else S_IN)
    about = Sheet("Read me", [90])
    for r, (v, st) in enumerate([
        ("Appointment book", S_TITLE),
        ("Week: one sheet for each week, Monday to Sunday, in half-hour slots from 9:00 to 21:00.", S_TEXT),
        ("Write the week's first date in Week of. For the next week, copy the sheet "
         "(right-click its tab, then Move or Copy).", S_TEXT),
        ("A longer service takes more than one slot: write it in each one.", S_TEXT),
        ("Bookings: one row for each booking, with the client's phone and notes. "
         "Replace the two example rows with your own.", S_TEXT),
        ("To print a week, print the Week sheet. It fits on one A4 page, landscape.", S_TEXT),
        (MADE_WITH, S_GREY),
    ], 1):
        about.put(f"A{r}", v, st)
    return [week, book, about]


# The Bookings sheet's examples in their slots: a service longer than a slot is
# written in each one, as the Read me says (Global colour 2 hours, the haircut 45 minutes).
WEEK_OF = "2 Nov 2026"  # a Monday; the bookings are on 3 and 7 November
SAMPLE_WEEK = [("Tuesday", "10:00", 4, "Priya Nair", "Global colour"),
               ("Saturday", "17:30", 2, "Rahul Menon", "Haircut and blow-dry")]


def appointment_page(ex=False):
    """One A4 landscape week to print: time slots down, days across; `ex`, the sample week."""
    ops, text, line, _ = pdf_ops()
    ops.append("0.82 0.84 0.86 RG 0.75 w")
    text(40, 552, "Appointment book", 18, bold=True)
    text(560, 552, "Week of", 10, bold=True)
    line(610, 549, 802, 549)
    if ex:
        text(614, 552, WEEK_OF, 10)
    x0, tw, dw, top, hh, rh = 40, 50, 101, 525, 20, 19
    right, bottom = x0 + tw + dw * len(DAYS), top - hh - rh * len(SLOTS)
    ops.append(f"0.95 0.96 0.96 rg {x0} {top - hh} {right - x0} {hh} re f")
    ops.append(f"{x0} {bottom} {right - x0} {top - bottom} re S")
    text(x0 + 6, top - 14, "Time", 9, bold=True)
    for i, day in enumerate(DAYS):
        x = x0 + tw + dw * i
        line(x, top, x, bottom)
        text(x + 6, top - 14, day, 9, bold=True)
    for i, slot in enumerate(SLOTS):
        y = top - hh - rh * i
        line(x0, y, right, y)
        text(x0 + 6, y - 13, slot, 8, grey=slot.endswith(":30"))
    for day, start, slots, client, service in SAMPLE_WEEK if ex else []:
        x, first = x0 + tw + dw * DAYS.index(day), SLOTS.index(start)
        for i in range(first, first + slots):
            y = top - hh - rh * i
            text(x + 5, y - 8, client, 7, bold=True)
            text(x + 5, y - 16, service, 7)
    text(353, 25, MADE_WITH, 8, grey=True)
    return "\n".join(ops)


# ---------------------------------------------------------------- checks

def check(path):
    if path.suffix in (".xlsx", ".docx"):
        with zipfile.ZipFile(path) as z:
            assert z.testzip() is None, path
            for name in z.namelist():
                parseString(z.read(name))  # raises on bad XML
            assert "[Content_Types].xml" in z.namelist()
    elif path.suffix == ".pdf":
        data = path.read_bytes()
        xref = int(re.search(rb"startxref\n(\d+)", data).group(1))
        assert data[xref:xref + 4] == b"xref", path
        for i, off in enumerate(re.findall(rb"(\d{10}) 00000 n", data), 1):
            assert data[int(off):].startswith(f"{i} 0 obj".encode()), (path, i)
    print(f"ok  {path.relative_to(FILES)}  {path.stat().st_size} bytes")


def main():
    gst_ex = {"seller": SALON, "customer": CUSTOMER, "number": "INV-0001", "lines": GST_LINES}
    bos_ex = {"seller": BOS_SELLER, "customer": BOS_CUSTOMER, "number": "BOS-0001", "lines": BOS_LINES}
    out = {
        "gst-invoice-format/gst-invoice-format.xlsx": lambda p: write_xlsx(
            p, [gst_invoice_sheet("Invoice", None), gst_invoice_sheet("Example", gst_ex)]),
        "gst-invoice-format/gst-invoice-format.docx": lambda p: write_docx(
            p, gst_invoice_doc(None) + [PAGE_BREAK] + gst_invoice_doc({**gst_ex})),
        "bill-of-supply-format/bill-of-supply-format.xlsx": lambda p: write_xlsx(
            p, [bill_of_supply_sheet("Bill", None), bill_of_supply_sheet("Example", bos_ex)]),
        "bill-of-supply-format/bill-of-supply-format.docx": lambda p: write_docx(
            p, bill_of_supply_doc(None) + [PAGE_BREAK] + bill_of_supply_doc(bos_ex)),
        "receipt-format/receipt-format.docx": lambda p: write_docx(
            p, receipt_doc(None) + [PAGE_BREAK] + receipt_doc(True)),
        "receipt-format/receipt-format.pdf": lambda p: write_pdf(
            p, [receipt_page(False), receipt_page(True)]),
        "customer-list-template/customer-list.xlsx": lambda p: write_xlsx(p, customer_sheets()),
        "customer-list-template/customer-list.csv": lambda p: p.write_text(
            "".join(",".join(row) + "\r\n" for row in CUSTOMERS), encoding="utf-8"),
        "salon-rate-card/salon-rate-card.pdf": lambda p: write_pdf(
            p, [rate_card_page(False), rate_card_page(True)], title="Salon rate card"),
        "salon-rate-card/salon-rate-card.docx": lambda p: write_docx(
            p, rate_card_doc(False) + [PAGE_BREAK] + rate_card_doc(True)),
        "appointment-book/appointment-book.xlsx": lambda p: write_xlsx(p, appointment_sheets()),
        "appointment-book/appointment-book.pdf": lambda p: write_pdf(
            p, [appointment_page(), appointment_page(True)], title="Appointment book", size=(842, 595)),
    }
    for rel, make in out.items():
        path = FILES / rel
        make(path)
        check(path)


if __name__ == "__main__":
    main()

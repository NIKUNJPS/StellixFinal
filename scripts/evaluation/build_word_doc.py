"""Build docs/evaluation/Stellix_Labs_Evaluation_Evidence.docx from the markdown evidence documents.

The Word file is organised under the eight requested evidence headings. Content is taken verbatim from
docs/evaluation/*.md (so the Word and markdown versions cannot drift); this script only re-orders and formats it.

Usage: python scripts\\evaluation\\build_word_doc.py     (needs python-docx)
"""
from __future__ import annotations

import os
import re
from datetime import date

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL = os.path.join(ROOT, "docs", "evaluation")
OUT = os.path.join(EVAL, "Stellix_Labs_Evaluation_Evidence.docx")

NAVY = RGBColor(0x1F, 0x2A, 0x44)
GREY = RGBColor(0x59, 0x59, 0x59)
BLUE = RGBColor(0x05, 0x63, 0xC1)


# ----------------------------------------------------------------------------- markdown helpers
def read(name: str) -> str:
    with open(os.path.join(EVAL, name), encoding="utf-8") as fh:
        return fh.read()


def sections(md: str, level: int = 2) -> dict[str, str]:
    """Split markdown by headings of `level`; key = heading text without the leading number, value = body."""
    mark = "#" * level + " "
    out: dict[str, str] = {}
    cur, buf = None, []
    for line in md.splitlines():
        if line.startswith(mark) and not line.startswith(mark + "#"):
            if cur is not None:
                out[cur] = "\n".join(buf).strip("\n")
            cur, buf = line[len(mark):].strip(), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        out[cur] = "\n".join(buf).strip("\n")
    return out


def pick(secs: dict[str, str], starts: str) -> tuple[str, str]:
    for k, v in secs.items():
        if k.startswith(starts):
            return k, v
    raise KeyError(starts)


# ----------------------------------------------------------------------------- docx helpers
def set_cell_shade(cell, hex_fill: str) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def set_cell_margins(cell, top=40, bottom=40, left=70, right=70) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for k, v in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{k}")
        el.set(qn("w:w"), str(v))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    tcPr.append(mar)


def add_hyperlink(par, text: str, url: str, size: float | None = None) -> None:
    rid = par.part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), rid)
    r = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    c = OxmlElement("w:color")
    c.set(qn("w:val"), "0563C1")
    u = OxmlElement("w:u")
    u.set(qn("w:val"), "single")
    rPr.append(c)
    rPr.append(u)
    if size:
        sz = OxmlElement("w:sz")
        sz.set(qn("w:val"), str(int(size * 2)))
        rPr.append(sz)
    r.append(rPr)
    t = OxmlElement("w:t")
    t.text = text
    t.set(qn("xml:space"), "preserve")
    r.append(t)
    h.append(r)
    par._p.append(h)


INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|(?<![\w*])\*[^*\n]+\*(?![\w*]))")


def add_inline(par, text: str, size: float | None = None, bold=False, italic=False, color=None) -> None:
    def run(t: str, b=False, i=False, mono=False):
        r = par.add_run(t)
        r.bold = bold or b
        r.italic = italic or i
        if size:
            r.font.size = Pt(size)
        if color is not None:
            r.font.color.rgb = color
        if mono:
            r.font.name = "Consolas"
            r._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
            r.font.size = Pt((size or 10.5) - 1)
        return r

    pos = 0
    for m in INLINE.finditer(text):
        if m.start() > pos:
            run(text[pos:m.start()])
        tok = m.group(0)
        if tok.startswith("**"):
            add_inline(par, tok[2:-2], size=size, bold=True, italic=italic, color=color)  # allow `code` inside bold
        elif tok.startswith("`"):
            run(tok[1:-1], mono=True)
        elif tok.startswith("["):
            label, url = re.match(r"\[([^\]]+)\]\(([^)]+)\)", tok).groups()
            if url.startswith("http"):
                add_hyperlink(par, label, url, size)
            else:
                run(label)  # relative links to sibling documents: keep the label only
        else:
            run(tok[1:-1], i=True)
        pos = m.end()
    if pos < len(text):
        run(text[pos:])


def shade_paragraph(par, fill: str) -> None:
    pPr = par._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    pPr.append(shd)


def left_border(par, color="9AA5B1") -> None:
    pPr = par._p.get_or_add_pPr()
    b = OxmlElement("w:pBdr")
    l = OxmlElement("w:left")
    l.set(qn("w:val"), "single")
    l.set(qn("w:sz"), "18")
    l.set(qn("w:space"), "6")
    l.set(qn("w:color"), color)
    b.append(l)
    pPr.append(b)


def split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in re.split(r"(?<!\\)\|", line)]


def usable_width_cm(doc: Document) -> float:
    s = doc.sections[-1]
    return (s.page_width - s.left_margin - s.right_margin) / 360000


def add_table(doc: Document, rows: list[list[str]]) -> None:
    ncol = max(len(r) for r in rows)
    rows = [r + [""] * (ncol - len(r)) for r in rows]
    t = doc.add_table(rows=len(rows), cols=ncol)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    size = 9 if ncol <= 4 else 8 if ncol <= 8 else 7
    total = usable_width_cm(doc)
    # width proportional to the longest text per column, bounded so no column collapses
    weights = []
    for c in range(ncol):
        longest = max(len(re.sub(r"[*`]", "", rows[r][c])) for r in range(len(rows)))
        weights.append(min(max(longest, 6), 60))
    sw = sum(weights)
    widths = [max(total * w / sw, 1.1) for w in weights]
    scale = total / sum(widths)
    widths = [w * scale for w in widths]
    for ri, row in enumerate(rows):
        for ci, text in enumerate(row):
            cell = t.cell(ri, ci)
            cell.width = Cm(widths[ci])
            set_cell_margins(cell)
            par = cell.paragraphs[0]
            par.paragraph_format.space_after = Pt(0)
            par.paragraph_format.space_before = Pt(0)
            if ri == 0:
                set_cell_shade(cell, "E8ECF4")
                add_inline(par, text, size=size, bold=True, color=NAVY)
            else:
                add_inline(par, text, size=size)
    # repeat the header row on every page
    trPr = t.rows[0]._tr.get_or_add_trPr()
    h = OxmlElement("w:tblHeader")
    h.set(qn("w:val"), "true")
    trPr.append(h)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def render_markdown(doc: Document, md: str, demote: int = 0) -> None:
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        # code fence
        if line.strip().startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            par = doc.add_paragraph()
            shade_paragraph(par, "F3F4F6")
            par.paragraph_format.space_after = Pt(6)
            for n, code_line in enumerate(buf):
                r = par.add_run(code_line)
                r.font.name = "Consolas"
                r._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
                r.font.size = Pt(8)
                if n < len(buf) - 1:
                    r.add_break()
            continue
        # table
        if line.strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:\-|]+\|?\s*$", lines[i + 1]) and "-" in lines[i + 1]:
            rows = [split_row(line)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            add_table(doc, rows)
            continue
        # heading
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level = min(len(m.group(1)) + demote, 4)
            doc.add_heading(re.sub(r"[*`]", "", m.group(2)), level=level)
            i += 1
            continue
        # blockquote
        if line.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip("> ").strip())
                i += 1
            par = doc.add_paragraph()
            shade_paragraph(par, "F5F7FA")
            left_border(par)
            par.paragraph_format.left_indent = Cm(0.3)
            add_inline(par, " ".join(buf), size=10, italic=True, color=GREY)
            continue
        # list item (bullet or numbered), with simple continuation lines
        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            indent = len(m.group(1)) // 2
            numbered = m.group(2)[0].isdigit()
            text = m.group(3)
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]) and not lines[i].strip().startswith(("|", "#", "```", ">")):
                text += " " + lines[i].strip()
                i += 1
            par = doc.add_paragraph(style="List Number" if numbered else "List Bullet")
            if indent:
                par.paragraph_format.left_indent = Cm(0.63 * (indent + 1))
            par.paragraph_format.space_after = Pt(2)
            add_inline(par, text)
            continue
        # paragraph (merge consecutive text lines)
        buf = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,6}\s|\s*([-*]|\d+\.)\s|\||```|>)", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        par = doc.add_paragraph()
        par.paragraph_format.space_after = Pt(6)
        add_inline(par, " ".join(buf))


def add_page_number_footer(section) -> None:
    p = section.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Stellix Labs evaluation evidence  |  page ")
    r.font.size = Pt(8)
    r.font.color.rgb = GREY
    for kind, txt in (("begin", None), (None, "PAGE"), ("end", None)):
        run = p.add_run()
        run.font.size = Pt(8)
        run.font.color.rgb = GREY
        if kind:
            fc = OxmlElement("w:fldChar")
            fc.set(qn("w:fldCharType"), kind)
            run._r.append(fc)
        else:
            it = OxmlElement("w:instrText")
            it.set(qn("xml:space"), "preserve")
            it.text = txt
            run._r.append(it)


def page_break(doc: Document) -> None:
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# ----------------------------------------------------------------------------- build
def main() -> None:
    readme, d01, d02, d03, d04, d05, d06 = (read(f) for f in (
        "README.md", "01-implementation-and-testing.md", "02-datasets-and-provenance.md", "03-experimental-protocol.md",
        "04-results.md", "05-baselines-and-ablations.md", "06-references.md"))
    rd, s01, s02, s03, s04, s05, s06 = (sections(x) for x in (readme, d01, d02, d03, d04, d05, d06))

    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(1.9)
    sec.top_margin = Cm(1.9)
    sec.bottom_margin = Cm(1.8)
    add_page_number_footer(sec)

    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    st.font.size = Pt(10.5)
    for name, size, color in (("Heading 1", 18, NAVY), ("Heading 2", 14, NAVY), ("Heading 3", 12, NAVY), ("Heading 4", 11, GREY)):
        h = doc.styles[name]
        h.font.name = "Calibri"
        h.element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
        h.font.size = Pt(size)
        h.font.bold = True
        h.font.color.rgb = color
        h.paragraph_format.space_before = Pt(14 if name == "Heading 1" else 10)
        h.paragraph_format.space_after = Pt(4)
        h.paragraph_format.keep_with_next = True

    # ---- title block
    t = doc.add_paragraph()
    t.paragraph_format.space_before = Pt(36)
    r = t.add_run("Stellix Labs")
    r.font.size = Pt(30)
    r.bold = True
    r.font.color.rgb = NAVY
    t2 = doc.add_paragraph()
    r = t2.add_run("Research Evidence Pack: implementation, measured results, protocol, baselines and references")
    r.font.size = Pt(14)
    r.font.color.rgb = GREY
    t3 = doc.add_paragraph()
    r = t3.add_run(f"Prepared {date.today():%d %B %Y} from the live codebase and database. Every number is produced by a script in "
                   "scripts/evaluation/ or read from a stored record; limitations are stated beside the result they affect.")
    r.font.size = Pt(10)
    r.italic = True

    doc.add_heading("Contents", level=2)
    titles = [
        "1. Current source code or repository",
        "2. Actual experimental results",
        "3. Dataset and data provenance",
        "4. Experimental protocol and configuration",
        "5. Baseline and comparison results",
        "6. Component / ablation results",
        "7. Implementation and testing evidence",
        "8. Verified academic papers and references",
    ]
    for ti in titles:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(1)
        add_inline(p, ti)

    # ---- summary
    doc.add_heading("Summary: what the evidence shows", level=1)
    render_markdown(doc, pick(rd, "1. Headline")[1], demote=1)
    doc.add_heading("What each public claim can and cannot rest on", level=2)
    render_markdown(doc, pick(rd, "3. What each public claim")[1], demote=1)

    # ---- 1
    page_break(doc)
    doc.add_heading(titles[0], level=1)
    render_markdown(doc, pick(s01, "1. Repository")[1], demote=1)
    doc.add_heading("Source ZIP (secrets excluded)", level=2)
    render_markdown(doc, pick(rd, "5. Source ZIP")[1], demote=1)

    # ---- 2
    page_break(doc)
    doc.add_heading(titles[1], level=1)
    render_markdown(doc, "Every value below comes from the live database or from a script in `scripts/evaluation/`. "
                    "For each result: what produced it, what it measures, and what it does not show. Raw CSV and JSON files are "
                    "in `docs/evaluation/evidence/`.", demote=1)
    for k, v in s04.items():
        doc.add_heading(re.sub(r"^\d+\.\s*", "", k), level=2)
        render_markdown(doc, v, demote=1)
    doc.add_heading("Metric definitions", level=2)
    render_markdown(doc, pick(s03, "3. Strategies and backtests")[1], demote=1)

    # ---- 3
    page_break(doc)
    doc.add_heading(titles[2], level=1)
    for k, v in s02.items():
        doc.add_heading(re.sub(r"^\d+\.\s*", "", k), level=2)
        render_markdown(doc, v, demote=1)

    # ---- 4
    page_break(doc)
    doc.add_heading(titles[3], level=1)
    for k, v in s03.items():
        doc.add_heading(re.sub(r"^\d+\.\s*", "", k), level=2)
        render_markdown(doc, v, demote=1)

    # ---- 5 / 6
    page_break(doc)
    doc.add_heading(titles[4], level=1)
    render_markdown(doc, "Only comparisons that were actually run are reported. Statistics are paired across strategies; "
                    "intervals are bootstrap 95% (10,000 resamples, seed 42); p-values are two-sided Wilcoxon signed-rank tests. "
                    "With 32 and 8 strategies that share signals these are descriptive, not independent-sample significance claims.",
                    demote=1)
    for starts, title in (("1. Experiment A", "Experiment A: regime conditioning out of sample, against random regime choice and buy-and-hold"),
                          ("2. Experiment B", "Experiment B: genetic algorithm versus random search versus the untouched seed"),
                          ("4. Baseline D", "Baseline: naive ranking by backtest Sharpe versus the validation composite"),
                          ("5. Baseline E", "Baseline: buy-and-hold")):
        k, v = pick(s05, starts)
        doc.add_heading(title, level=2)
        body = re.sub(r"^\*\*Hypothesis under test.*?\n", "", v, count=0)
        render_markdown(doc, body, demote=1)

    page_break(doc)
    doc.add_heading(titles[5], level=1)
    render_markdown(doc, "What changes when a component is removed or disabled. Items that were not tested are marked as proposed "
                    "experiments and have no results.", demote=1)
    doc.add_heading("Regime conditioning (ablation by gating), tested", level=2)
    render_markdown(doc, "Experiment A in section 5 is the regime-conditioning ablation: each strategy is run with and without "
                    "restriction to the regimes learned on earlier data, on held-out later data. Headline: no gain in return or "
                    "Sharpe, a drawdown reduction, and learned regimes beat random regimes (about the 72nd percentile).", demote=1)
    doc.add_heading("Evolutionary optimization (ablation by comparison), tested", level=2)
    render_markdown(doc, "Experiment B in section 5 compares the evolved result with the unevolved seed and with random search. "
                    "Headline: better in-sample, no reliable held-out benefit.", demote=1)
    doc.add_heading("Validation components (post-hoc ablation)", level=2)
    render_markdown(doc, pick(s05, "3. Ablation C")[1], demote=1)
    doc.add_heading("Proposed experiments (not run)", level=2)
    render_markdown(doc, pick(s05, "6. Proposed")[1], demote=1)

    # ---- 7
    page_break(doc)
    doc.add_heading(titles[6], level=1)
    for starts in ("2. Component status", "3. Test evidence", "4. Known failures", "5. Third-party"):
        k, v = pick(s01, starts)
        doc.add_heading(re.sub(r"^\d+\.\s*", "", k), level=2)
        render_markdown(doc, v, demote=1)

    # ---- 8
    page_break(doc)
    doc.add_heading(titles[7], level=1)
    intro = d06.split("\n## A.")[0]
    intro = "\n".join(l for l in intro.splitlines() if not l.startswith("# ") and not l.startswith("> Covers"))
    render_markdown(doc, intro, demote=1)
    for k, v in s06.items():
        doc.add_heading(k, level=2)
        render_markdown(doc, v, demote=1)
    render_markdown(doc, "BibTeX for every entry is in `docs/evaluation/references.bib`.", demote=1)

    for p in doc.paragraphs:  # section titles taken from markdown may carry backticks around file paths
        if p.style.name.startswith("Heading"):
            for r in p.runs:
                r.text = r.text.replace("`", "").replace("**", "")

    doc.core_properties.title = "Stellix Labs Research Evidence Pack"
    doc.core_properties.author = "Stellix Labs"
    doc.save(OUT)
    print("wrote", OUT, f"({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

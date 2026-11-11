# -*- coding: utf-8 -*-
"""Build the MaxAgent business plan DOCX (python-docx)."""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ROW_HEIGHT_RULE
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "assets")
OUT = os.path.join(os.path.dirname(os.path.dirname(BASE)), "MaxAgent_商業計劃書.docx")

FONT = "微軟正黑體"
NAVY = "0E2A3D"
INK = "172A3A"
TEAL = "116B78"
SLATE = "516575"
MUTED = "7C8B98"
BORDER = "D7E1EA"
LIGHT = "F3F6FA"
TINT = "EEF4F7"
SAND = "FBF7EE"

CONTENT_W = 16.4  # cm of usable width


# ------------------------------------------------------------------ low level
def _el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn("w:" + k), str(v))
    return e


def set_font(run, size=10.5, bold=False, color=INK, font=FONT):
    run.font.name = font
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)
    rPr = run._r.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = _el("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), font)
    rFonts.set(qn("w:hAnsi"), font)
    rFonts.set(qn("w:eastAsia"), font)
    rFonts.set(qn("w:cs"), font)


def track(run, val=40):
    rPr = run._r.get_or_add_rPr()
    sp = rPr.find(qn("w:spacing"))
    if sp is None:
        sp = _el("w:spacing")
        rPr.append(sp)
    sp.set(qn("w:val"), str(val))


def spacing(par, before=0, after=6, line=1.55, rule="multiple"):
    pf = par.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    if rule == "multiple":
        pf.line_spacing = line
    else:
        pf.line_spacing = Pt(line)
    return par


def para(doc, text="", size=10.5, bold=False, color=INK, align="justify",
         before=0, after=6, line=1.55, indent=0.0, keep=False):
    p = doc.add_paragraph()
    if text:
        r = p.add_run(text)
        set_font(r, size, bold, color)
    amap = {"justify": WD_ALIGN_PARAGRAPH.JUSTIFY, "left": WD_ALIGN_PARAGRAPH.LEFT,
            "center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT}
    p.alignment = amap[align]
    spacing(p, before, after, line)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    if keep:
        p.paragraph_format.keep_with_next = True
    return p


def rich(doc, parts, size=10.5, align="justify", before=0, after=6, line=1.55, indent=0.0):
    """parts: list of (text, bold, color)"""
    p = doc.add_paragraph()
    for t, b, c in parts:
        r = p.add_run(t)
        set_font(r, size, b, c)
    amap = {"justify": WD_ALIGN_PARAGRAPH.JUSTIFY, "left": WD_ALIGN_PARAGRAPH.LEFT}
    p.alignment = amap[align]
    spacing(p, before, after, line)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    return p


def bullet(doc, text, size=10.5, color=INK, indent=0.62, after=3, bold_head=None):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(indent)
    pf.first_line_indent = Cm(-indent)
    spacing(p, 0, after, 1.5)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p.add_run("•  ")
    set_font(r, size, False, TEAL)
    if bold_head:
        r = p.add_run(bold_head)
        set_font(r, size, True, INK)
    r = p.add_run(text)
    set_font(r, size, False, color)
    return p


def numbered(doc, idx, title, body, size=10.5):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(0.85)
    pf.first_line_indent = Cm(-0.85)
    spacing(p, 0, 5, 1.5)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p.add_run(f"{idx:02d}   ")
    set_font(r, size, True, TEAL)
    r = p.add_run(title)
    set_font(r, size, True, NAVY)
    if body:
        r = p.add_run("　" + body)
        set_font(r, size, False, INK)
    return p


def hairline(doc, color=BORDER, size=6, before=2, after=8):
    p = doc.add_paragraph()
    spacing(p, before, after, 1.0)
    pPr = p._p.get_or_add_pPr()
    pBdr = _el("w:pBdr")
    pBdr.append(_el("w:bottom", val="single", sz=size, space=1, color=color))
    pPr.append(pBdr)
    return p


def h1(doc, num, title, kicker, page_break=True):
    k = doc.add_paragraph()
    spacing(k, 6, 2, 1.0)
    if page_break:
        k.paragraph_format.page_break_before = True
    r = k.add_run(f"第 {num} 章　·　{kicker}" if num else kicker)
    set_font(r, 9, True, TEAL)
    track(r, 40)
    t = doc.add_paragraph()
    spacing(t, 0, 4, 1.15)
    t.paragraph_format.keep_with_next = True
    r = t.add_run(title)
    set_font(r, 21, True, NAVY)
    hairline(doc, TEAL, 8, 2, 12)


def h2(doc, num, text=None):
    if text is None:
        num, text = None, num
    p = doc.add_paragraph()
    spacing(p, 14, 4, 1.3)
    p.paragraph_format.keep_with_next = True
    if num:
        r = p.add_run(num + "　")
        set_font(r, 12, True, TEAL)
    r = p.add_run(text)
    set_font(r, 12, True, NAVY)
    return p


def h3(doc, text):
    p = doc.add_paragraph()
    spacing(p, 9, 3, 1.3)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    set_font(r, 10.5, True, TEAL)
    return p


def lead(doc, text):
    p = doc.add_paragraph()
    spacing(p, 0, 10, 1.6)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    set_font(r, 10.5, False, SLATE)
    return p


# ------------------------------------------------------------------ tables
def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn("w:shd")):
        tcPr.remove(old)
    tcPr.append(_el("w:shd", val="clear", color="auto", fill=color))


def cell_borders(cell, color=BORDER, sz=4, edges=("top", "left", "bottom", "right")):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = _el("w:tcBorders")
    for e in edges:
        borders.append(_el("w:" + e, val="single", sz=sz, space=0, color=color))
    tcPr.append(borders)


def no_borders(table):
    tblPr = table._tbl.tblPr
    b = _el("w:tblBorders")
    for e in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b.append(_el("w:" + e, val="none", sz=0, space=0, color="auto"))
    tblPr.append(b)


def table_borders(table, color=BORDER, sz=4):
    tblPr = table._tbl.tblPr
    b = _el("w:tblBorders")
    for e in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b.append(_el("w:" + e, val="single", sz=sz, space=0, color=color))
    tblPr.append(b)


def cell_margins(table, top=60, bottom=60, left=100, right=100):
    tblPr = table._tbl.tblPr
    m = _el("w:tblCellMar")
    for k, v in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        m.append(_el("w:" + k, w=v, type="dxa"))
    tblPr.append(m)


def widths(table, cols):
    table.autofit = False
    tblPr = table._tbl.tblPr
    tblPr.append(_el("w:tblLayout", type="fixed"))
    tblPr.append(_el("w:tblW", w=int(sum(cols) * 567), type="dxa"))
    grid = table._tbl.tblGrid
    for gc, w in zip(grid.findall(qn("w:gridCol")), cols):
        gc.set(qn("w:w"), str(int(w * 567)))
    for row in table.rows:
        for c, w in zip(row.cells, cols):
            c.width = Cm(w)


def repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    trPr.append(_el("w:tblHeader", val="true"))


def cant_split(row):
    trPr = row._tr.get_or_add_trPr()
    trPr.append(_el("w:cantSplit", val="true"))


def vcenter(cell):
    tcPr = cell._tc.get_or_add_tcPr()
    tcPr.append(_el("w:vAlign", val="center"))


def caption(doc, text, before=8):
    p = doc.add_paragraph()
    spacing(p, before, 3, 1.2)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    set_font(r, 8.5, True, SLATE)
    return p


def source_note(doc, text):
    p = doc.add_paragraph()
    spacing(p, 2, 10, 1.25)
    r = p.add_run(text)
    set_font(r, 7.5, False, MUTED)
    return p


def table(doc, headers, rows, cols, size=9, header_size=8.8, align=None,
          zebra=True, first_col_bold=False, header_fill=NAVY, row_h=None, pad=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_borders(t, BORDER, 4)
    cell_margins(t, *(pad if pad else (60, 60, 100, 100)))
    widths(t, cols)
    hdr = t.rows[0]
    repeat_header(hdr)
    cant_split(hdr)
    for i, h in enumerate(headers):
        c = hdr.cells[i]
        shade(c, header_fill)
        vcenter(c)
        p = c.paragraphs[0]
        spacing(p, 2, 2, 1.15)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT if (align is None or align[i] != "center") else WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(h)
        set_font(r, header_size, True, "FFFFFF")
    for ri, row in enumerate(rows):
        tr = t.add_row()
        cant_split(tr)
        if row_h:
            tr.height = Cm(row_h)
            tr.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        for ci, val in enumerate(row):
            c = tr.cells[ci]
            vcenter(c)
            if zebra and ri % 2 == 1:
                shade(c, LIGHT)
            p = c.paragraphs[0]
            spacing(p, 2, 2, 1.25)
            a = (align[ci] if align else "left")
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if a == "center" else WD_ALIGN_PARAGRAPH.LEFT
            bold = first_col_bold and ci == 0
            r = p.add_run(str(val))
            set_font(r, size, bold, NAVY if bold else INK)
    spacer(doc, 7)
    return t


def kv_table(doc, rows, cols=(4.6, 11.8), size=9.5):
    t = doc.add_table(rows=0, cols=2)
    table_borders(t, BORDER, 4)
    cell_margins(t, 70, 70, 110, 110)
    widths(t, cols)
    for k, v in rows:
        tr = t.add_row()
        cant_split(tr)
        c0, c1 = tr.cells
        shade(c0, LIGHT)
        for c, txt, bold, color in ((c0, k, True, NAVY), (c1, v, False, INK)):
            vcenter(c)
            p = c.paragraphs[0]
            spacing(p, 2, 2, 1.3)
            r = p.add_run(txt)
            set_font(r, size, bold, color)
    return t


def callout(doc, title, body, fill=TINT, bar=TEAL, title_color=NAVY, pad=(140, 140, 220, 180)):
    t = doc.add_table(rows=1, cols=1)
    no_borders(t)
    width = CONTENT_W
    widths(t, [width])
    c = t.rows[0].cells[0]
    cant_split(t.rows[0])
    shade(c, fill)
    cell_borders(c, bar, 18, edges=("left",))
    cell_margins(t, *pad)
    p = c.paragraphs[0]
    spacing(p, 0, 3, 1.35)
    r = p.add_run(title)
    set_font(r, 9.5, True, title_color)
    p2 = c.add_paragraph()
    spacing(p2, 0, 0, 1.55)
    p2.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p2.add_run(body)
    set_font(r, 9.5, False, INK)
    spacer(doc, 6)
    return t


def spacer(doc, pts=6):
    p = doc.add_paragraph()
    spacing(p, 0, 0, 1.0)
    p.add_run(" ").font.size = Pt(pts)
    return p


def kpi_strip(doc, items, fill="F4F8FA"):
    t = doc.add_table(rows=1, cols=len(items))
    table_borders(t, BORDER, 4)
    cell_margins(t, 150, 140, 120, 120)
    widths(t, [CONTENT_W / len(items)] * len(items))
    for i, (big, small) in enumerate(items):
        c = t.rows[0].cells[i]
        shade(c, fill)
        vcenter(c)
        p = c.paragraphs[0]
        spacing(p, 0, 1, 1.0)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run(big)
        set_font(r, 17, True, TEAL)
        p2 = c.add_paragraph()
        spacing(p2, 0, 0, 1.2)
        r = p2.add_run(small)
        set_font(r, 7.8, False, SLATE)
    spacer(doc, 8)


def _trim(path, pad=10):
    """Crop uniform white margins so the artwork fills its frame."""
    from PIL import Image, ImageChops
    im = Image.open(path).convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    mask = ImageChops.difference(im, bg).convert("L").point(lambda v: 255 if v > 6 else 0)
    box = mask.getbbox()
    if not box:
        return path
    w, h = im.size
    left = max(0, box[0] - pad)
    top = max(0, box[1] - pad)
    right = min(w, box[2] + pad)
    bottom = min(h, box[3] + pad)
    out_dir = os.path.join(ASSETS, "_trim")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, os.path.splitext(os.path.basename(path))[0] + ".png")
    im.crop((left, top, right, bottom)).save(out)
    return out


def figure(doc, name, width_cm=CONTENT_W, cap=None):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    spacing(p, 8, 2, 1.0)
    p.paragraph_format.keep_with_next = True
    p.add_run().add_picture(_trim(os.path.join(ASSETS, name)), width=Cm(width_cm))
    if cap:
        c = doc.add_paragraph()
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        spacing(c, 2, 12, 1.2)
        r = c.add_run(cap)
        set_font(r, 8, False, MUTED)
    return p


# ------------------------------------------------------------------ document
def new_doc():
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    sec.top_margin = Cm(2.3)
    sec.bottom_margin = Cm(2.0)
    sec.left_margin = Cm(2.3)
    sec.right_margin = Cm(2.3)
    sec.header_distance = Cm(1.1)
    sec.footer_distance = Cm(1.1)
    sec.different_first_page_header_footer = True

    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = Pt(10.5)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.paragraph_format.space_after = Pt(6)
    st.paragraph_format.line_spacing = 1.55

    # header
    hp = sec.header.paragraphs[0]
    hp.paragraph_format.tab_stops.add_tab_stop(Cm(CONTENT_W), WD_TAB_ALIGNMENT.RIGHT)
    hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = hp.add_run("機密　CONFIDENTIAL")
    set_font(r, 7.5, False, MUTED)
    r = hp.add_run("\tMaxAgent 商業計劃書　v1.0")
    set_font(r, 7.5, False, MUTED)
    pPr = hp._p.get_or_add_pPr()
    pBdr = _el("w:pBdr")
    pBdr.append(_el("w:bottom", val="single", sz=4, space=4, color=BORDER))
    pPr.append(pBdr)

    # footer
    fp = sec.footer.paragraphs[0]
    fp.paragraph_format.tab_stops.add_tab_stop(Cm(CONTENT_W), WD_TAB_ALIGNMENT.RIGHT)
    fp.paragraph_format.tab_stops.add_tab_stop(Cm(0), WD_TAB_ALIGNMENT.LEFT)
    pPr = fp._p.get_or_add_pPr()
    pBdr = _el("w:pBdr")
    pBdr.append(_el("w:top", val="single", sz=4, space=6, color=BORDER))
    pPr.append(pBdr)
    r = fp.add_run("MaxAgent 商業計劃書　·　本地優先的跨 Harness 工作台")
    set_font(r, 7.5, False, MUTED)
    r = fp.add_run("\t第 ")
    set_font(r, 7.5, False, MUTED)
    add_field(fp, "PAGE")
    r = fp.add_run(" 頁 / 共 ")
    set_font(r, 7.5, False, MUTED)
    add_field(fp, "NUMPAGES")
    r = fp.add_run(" 頁")
    set_font(r, 7.5, False, MUTED)
    return doc


def add_field(par, instr):
    def run_with(child):
        r = par.add_run()
        set_font(r, 7.5, False, MUTED)
        r._r.append(child)
        return r
    run_with(_el("w:fldChar", fldCharType="begin"))
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = " %s " % instr
    run_with(it)
    run_with(_el("w:fldChar", fldCharType="separate"))
    r = par.add_run("1")
    set_font(r, 7.5, False, MUTED)
    run_with(_el("w:fldChar", fldCharType="end"))


# ------------------------------------------------------------------ cover
def cover(doc):
    # top label
    p = doc.add_paragraph()
    spacing(p, 26, 14, 1.0)
    r = p.add_run("商業計劃書　／　BUSINESS PLAN")
    set_font(r, 8.5, True, TEAL)
    track(r, 60)

    # band
    t = doc.add_table(rows=1, cols=1)
    no_borders(t)
    widths(t, [CONTENT_W])
    row = t.rows[0]
    row.height = Cm(7.4)
    row.height_rule = WD_ROW_HEIGHT_RULE.EXACTLY
    c = row.cells[0]
    shade(c, NAVY)
    cell_margins(t, 300, 200, 320, 260)
    vcenter(c)
    p = c.paragraphs[0]
    spacing(p, 0, 2, 1.0)
    r = p.add_run("MaxAgent")
    set_font(r, 44, True, "FFFFFF")
    p2 = c.add_paragraph()
    spacing(p2, 0, 0, 1.2)
    r = p2.add_run("跨 Agent Harness 的 Windows 本地工作台")
    set_font(r, 13, False, "BFD3DC")

    spacer(doc, 18)
    p = doc.add_paragraph()
    spacing(p, 10, 4, 1.45)
    r = p.add_run("在同一個桌面，看見所有 Agent 的對話；\n沿原對話 ID 續派任務，再回到原紀錄核對結果。")
    set_font(r, 15, True, NAVY)

    p = doc.add_paragraph()
    spacing(p, 6, 0, 1.7)
    r = p.add_run("不新開對話、不複製上下文、不托管憑證。所有工作留在使用者原本使用的工具裡，"
                  "MaxAgent 只負責讓它們被看見、被驅動、被核對。")
    set_font(r, 9.5, False, SLATE)

    spacer(doc, 26)
    kv = [
        ("文件版本", "v1.0　／　2026 年 11 月"),
        ("撰寫", "MaxAgent 專案團隊（agent-board contributors）"),
        ("文件性質", "產品與商業化規劃；內含未經審計的財務推估"),
        ("機密等級", "內部與投資人傳閱，不公開散布"),
        ("對應程式版本", "MaxAgent v0.1.0（Electron 45.2.3）"),
    ]
    t = doc.add_table(rows=0, cols=2)
    no_borders(t)
    widths(t, [4.2, 12.2])
    for k, v in kv:
        tr = t.add_row()
        cant_split(tr)
        p = tr.cells[0].paragraphs[0]
        spacing(p, 3, 3, 1.3)
        r = p.add_run(k)
        set_font(r, 8.5, True, MUTED)
        p = tr.cells[1].paragraphs[0]
        spacing(p, 3, 3, 1.3)
        r = p.add_run(v)
        set_font(r, 8.5, False, INK)

    spacer(doc, 4)
    hairline(doc, BORDER, 4, 10, 8)
    p = doc.add_paragraph()
    spacing(p, 0, 0, 1.4)
    r = p.add_run("本地優先　·　原對話續派　·　證據回填")
    set_font(r, 8, True, TEAL)


# ------------------------------------------------------------------ TOC
CHAPTERS = [
    ("摘要", "一頁讀完：問題、產品、市場、模式與募資", "Executive Summary"),
    ("1", "專案現況：這個產品到底在做什麼", "一份可以直接被驗證的產品定義，與目前的完成度證據"),
    ("2", "技術棧盤點", "Electron 45 的本地架構、與兩個 Harness 的整合方式、安全設計"),
    ("3", "技術債盤點", "20 項債務、1 個 P0、可量化的償還成本與順序"),
    ("4", "市場分析", "誰同時用兩個 Agent、這個市場有多大、競爭者站在哪裡"),
    ("5", "產品與定位", "三個「不」構成的價值主張，與 12 個月的產品路線"),
    ("6", "商業模式", "Free / Pro / Team 的定價邏輯與單位經濟"),
    ("7", "進入市場策略", "從 0 到 9,000 名付費用戶的三段式路徑"),
    ("8", "財務預測", "三年損益、現金曲線、40 萬美元用途與敏感度"),
    ("9", "執行計畫", "四個季度的里程碑、團隊配置與交付制度"),
    ("10", "風險登記簿", "12 項風險的機率、影響、緩解與觸發指標"),
    ("11", "法務與合規", "MIT 授權、CLI 條款、內嵌二進位與商標"),
    ("12", "結論與募資訴求", "三句話總結與資金—里程碑對應"),
    ("附錄", "版本清單、驗證證據、名詞表與資料來源", "所有可查核的細節"),
]


def toc(doc):
    p = doc.add_paragraph()
    spacing(p, 0, 2, 1.1)
    p.paragraph_format.page_break_before = True
    r = p.add_run("文件說明")
    set_font(r, 16, True, NAVY)
    hairline(doc, TEAL, 8, 2, 12)

    para(doc, "這份文件回答三個問題：MaxAgent 是什麼、它建立在什麼技術之上、以及它能不能成為一門生意。"
              "撰寫順序刻意與一般的商業計劃相反——先把專案拆到底（第 1 至 3 章），再談市場與商業（第 4 至 8 章），"
              "最後才是執行、風險與法務（第 9 至 12 章）。原因是：這個產品的價值完全取決於它對底層工具格式的掌握程度，"
              "而它的風險也幾乎全部來自同一處。先把技術現實寫清楚，後面的數字才有意義。"
              "技術數據均來自 2026 年 11 月在單一 Windows 機器上的實測與原始碼盤點，財務數字則為規劃推估："
              "技術段落給證據，財務段落給假設；尚未完成的功能一律標明「未實作」。", line=1.45)

    para(doc, "免責聲明：本文件包含前瞻性陳述，實際結果可能因平台政策、上游 API 變更、匯率與競爭環境而不同。"
              "財務模型為自建試算，未經會計師查核。文件中提及的第三方產品名稱與商標，均屬其各自所有者。",
         size=8.2, color=MUTED, line=1.4, after=2)

    spacer(doc, 14)
    callout(doc, "閱讀建議",
            "只看一頁：讀摘要。要判斷能不能交付：讀 3.4 節的 P0 深潛。要判斷市場：讀第 4 章。"
            "要判斷財務紀律：讀 8.6 節的敏感度分析。")

    spacer(doc, 16)
    p = doc.add_paragraph()
    spacing(p, 0, 4, 1.15)
    r = p.add_run("這份文件的三個圖")
    set_font(r, 11, True, NAVY)
    para(doc, "全文只有三張圖，每一張都對應一個章節的核心判斷；其餘皆以表格呈現，方便逐項核對數字。",
         size=9.5, color=SLATE, after=8)
    rows = [
        ("圖 1", "系統架構：三層與兩條資料流", "第 2 章", "誰讀誰、哪裡唯讀、哪裡寫入"),
        ("圖 2", "技術債優先矩陣：20 項的落點", "第 3 章", "哪一項必須先修"),
        ("圖 3", "三年財務預測：收入、成本與末 ARR", "第 8 章", "什麼時候現金流轉正"),
    ]
    table(doc, ["編號", "圖名", "所在章節", "它回答什麼"], rows, [2.0, 7.2, 2.2, 5.0], size=8.6,
          align=["center", "left", "center", "left"], first_col_bold=True)

    # ---- 章節導覽（獨立一頁）
    p = doc.add_paragraph()
    spacing(p, 0, 2, 1.1)
    p.paragraph_format.page_break_before = True
    r = p.add_run("章節導覽")
    set_font(r, 16, True, NAVY)
    hairline(doc, TEAL, 8, 2, 12)
    para(doc, "十三章、一份附錄。左欄是章號，中欄是這一章處理的問題，右欄是它給出的答案。",
         size=9.5, color=SLATE, after=8)

    rows = [(n, t, d) for n, t, d in CHAPTERS]
    table(doc, ["章", "標題", "這一章回答什麼"], rows, [1.4, 5.8, 9.2], size=8.6, header_size=8.6,
          align=["center", "left", "left"], first_col_bold=True, pad=(34, 34, 90, 90))


# ------------------------------------------------------------------ summary
def summary(doc):
    h1(doc, None, "摘要", "EXECUTIVE SUMMARY")

    rich(doc, [("如果一個開發者同時用 Codex 和 Claude Code，他今天的處境是：兩個視窗、兩套歷史、兩種格式，"
                "而且每次想「接著上次那個任務繼續」時，只能新開一個對話，把前文重新貼一遍。"
                "MaxAgent 把這件事變成一個動作：", False, INK),
               ("在原對話上續派，結果寫回原紀錄。", True, TEAL)], after=10)

    para(doc, "它不是第三個 Agent，也不是又一個聊天介面。它是一個 Windows 桌面工作台：掃描本機既有的 "
              "Codex（~/.codex/sessions/）與 Claude Code（~/.claude/projects/）對話紀錄，用卡片總覽呈現每個對話的"
              "工具、模型、狀態與最後一輪；點開就能沿原對話 ID 派下一輪；派完之後，回到原工具的同一則紀錄裡核對結果。"
              "整個過程不複製對話、不上傳內容、不托管使用者的 API 憑證。")

    para(doc, "技術上，它已經通過最關鍵的一次驗證：以獨立的 app-server 對 Codex thread "
              "01a1c113-e992-7090-9718-3d42fef14fb5 續派並收到同輪 turn/completed；以 --resume 對 Claude session "
              "e7323699-c804-4dd7-a928-dc8a15dccaef 成功執行。23 項自動測試全數通過，冷啟動 1.6 秒，暖刷新在快取生效後降到 16 毫秒。"
              "但它同時有一個尚未解決的 P0：當對話正被 Codex 桌面程序持有時，第二次派工會收到 "
              "-32600 already has an active writer。這件事決定了它現在是「可演示」，還不是「可販售」。")

    kpi_strip(doc, [
        ("2 / 2", "已打通的 Harness：Codex 與 Claude Code"),
        ("23", "自動測試全數通過（node:test）"),
        ("20 項", "技術債，合計約 110 人日"),
        ("US$400k", "建議種子輪，對應 18 個月里程"),
    ])

    h2(doc, "四個判斷")
    numbered(doc, 1, "需求是真的，但比簡報裡寫的小。",
             "同時使用兩個以上 Agent 的開發者是明確存在的族群，但它是開發者中的少數（估計 2.6%–3.0%）。"
             "這意味著它適合做一個高單價、低行銷費用、靠社群擴散的工具生意，不適合做燒錢換規模的平台故事。")
    numbered(doc, 2, "護城河不在模型，在格式。",
             "MaxAgent 的價值來自對 rollout JSONL、Claude 專案 JSONL、模型目錄與供應商設定的掌握。"
             "這既是它短期難以被複製的原因，也是它最大的單點風險：上游一改格式，產品就要跟著改。")
    numbered(doc, 3, "P0 不是 bug，是產品定義問題。",
             "「原對話續派」是整個價值主張。如果 Codex 這一側長期只能降級成「複製任務到新對話」，"
             "那 MaxAgent 對 Codex 使用者的意義會退回成一個漂亮的歷史瀏覽器。這件事必須在募資前給出明確答案。")
    numbered(doc, 4, "這是一門可以自給自足的生意，不是獨角獸。",
             "以年 ARPU 125 美元、18% 年流失、CAC 120 美元估算，LTV/CAC 約 5.3 倍；第三年 9,000 名付費用戶對應約 112 萬美元 ARR。"
             "它能在 40 萬美元內走到現金流轉正，但不會長成十億美元公司——這一點應該在募資簡報第一頁就講清楚。")

    spacer(doc, 4)
    callout(doc, "本計劃書的誠實前提",
            "撰寫時，專案尚未打包、尚未簽章、沒有任何付費機制，且 Codex 派工存在已知阻斷。"
            "因此本文件把「技術債」獨立成章（第 3 章），並在財務模型中把修債成本直接計入人力。"
            "如果讀者只需要一個結論：這是一個技術上已經證明可行、商業上尚未證明可賣的產品，"
            "而它的下一步不是加功能，是先把 P0 關掉、把安裝檔做出來。")


# ------------------------------------------------------------------ chapter 1
def chapter1(doc):
    h1(doc, "1", "專案現況：這個產品到底在做什麼", "THE PRODUCT")
    lead(doc, "先把產品定義縮到不能再縮：一個看見所有 Agent 對話、並能沿原對話續派的 Windows 桌面程式。")

    h2(doc, "1.1", "一句話定義")
    callout(doc, "定義",
            "MaxAgent 是一個本地優先的 Windows 桌面工作台：它讀取使用者電腦上既有的 Codex 與 Claude Code 對話，"
            "以卡片方式總覽，並允許使用者在「原對話 ID」上續派下一輪任務，最後回到原工具的原始紀錄核對結果。",
            fill=SAND, bar="B06C1E")

    para(doc, "這句話裡有四個限定詞，每一個都在排除一種常見做法：本地優先（排除雲端託管）、既有對話（排除新建工作區）、"
              "原對話 ID（排除複製上下文重開）、回到原紀錄核對（排除自建一套結果頁）。這四個限定合起來，"
              "才是它與 Cursor、Conductor、Vibe Kanban 這類工具的真正差別。")

    h2(doc, "1.2", "它解決的四個具體痛點")
    para(doc, "這些痛點不是訪談得來的，是從程式碼與文件裡的行為反推出來的——每一項都對應產品裡的一個具體設計。")
    numbered(doc, 1, "對話散落在不同工具、不同格式裡。",
             "Codex 寫 rollout-*.jsonl 與 session_index.jsonl，Claude Code 寫 projects/*.jsonl，兩者的 schema 毫無關係。"
             "使用者要回想「上週那個重構任務是在哪個工具跑的」，只能兩個視窗各翻一遍。MaxAgent 的第一層價值就是把這件事收斂成一張看板。")
    numbered(doc, 2, "想接著做，只能重開一個對話。",
             "多數 Harness 的互動模型是「一個 session 一個上下文」。要延續昨天的任務，實務上的做法是複製前文、貼進新 session。"
             "代價是 token 重複計費、上下文被截斷、以及原本那條紀錄從此不再更新。")
    numbered(doc, 3, "派工之後，結果要靠記憶核對。",
             "Agent 說「完成了」，但完成在哪裡、改了哪些檔案、是不是同一個任務，使用者往往要切回原工具、往上滑、逐輪比對。"
             "MaxAgent 的 result-evidence 模組就是為了把這個動作變成「點一下回到那一輪」。")
    numbered(doc, 4, "執行狀態不可見。",
             "哪些對話在跑、哪些在等人、哪些卡住超過預期，只有打開每一個工具才知道。舊看板已經示範過狀態機"
             "（working / waitingYou / stalled / idle），新桌面版把它做成卡片上的即時狀態與 Windows 通知。")

    h2(doc, "1.3", "它刻意不是什麼")
    para(doc, "在一個「什麼都想做」的 AI 工具市場裡，邊界比功能更能說明產品。以下四件事是明確不做的：")
    rows = [
        ("不是新的 Agent Runtime", "不訓練、不托管模型、不提供自己的推理服務。", "它永遠是別人的前端，不是替代品。"),
        ("不是雲端工作區", "對話內容不離開本機；沒有伺服器端資料庫。", "隱私是賣點，也是成本結構的基礎。"),
        ("不托管 API 憑證", "沿用使用者既有的 CLI 登入與訂閱，不儲存 key。", "避開代管憑證的合規與安全責任。"),
        ("不複製對話", "續派發生在原 thread／原 session 上，不生成影子副本。", "這是它與「任務看板」類工具的分水嶺。"),
    ]
    table(doc, ["不做什麼", "具體含義", "為什麼這條邊界重要"], rows, [4.4, 6.6, 5.4], size=9,
          first_col_bold=True)

    h2(doc, "1.4", "目前的完成度：可以演示，還不能販售")
    para(doc, "下表只列可被驗證的能力，每一列都對應程式碼中的具體實作或一次實測紀錄。"
              "「未實作」與「未驗證」是兩種不同的狀態，此處刻意分開標示。")
    rows = [
        ("Codex 歷史讀取", "可用", "38 個 session 可列；rollout JSONL 解析出標題、輪次與完成事件"),
        ("Claude 歷史讀取", "可用", "11 個 session 級別可列；正確排除 subagents 目錄"),
        ("Codex 原對話續派", "有條件可用", "MAX-004 驗證成功（thread 01a1c113…，收到同輪 turn/completed）；但見 P0"),
        ("Claude 原對話續派", "已驗證", "session e7323699… 以 --resume 執行成功，exit 0"),
        ("模型目錄", "可用", "Codex model/list 回 9 個模型，首個模型含 6 種推理強度"),
        ("逐聊天室模型記憶", "可用", "寫入 state.json；供應商變更時以 sha256 指紋要求重選"),
        ("結果核對", "部分可用", "可在原紀錄定位本輪；原工具視窗不會即時刷新（需重開）"),
        ("未讀與狀態分離", "部分可用", "有行內文字標記，缺徽章與圖例"),
        ("桌面寵物與通知", "未驗證", "pet.html 可獨立開啟；Windows toast 未經目視確認"),
        ("安裝檔與簽章", "未實作", "無 electron-builder／forge 設定，僅 npm start"),
    ]
    table(doc, ["能力", "狀態", "證據"], rows, [4.2, 2.6, 9.6], size=8.8,
          align=["left", "center", "left"], first_col_bold=True)
    source_note(doc, "資料來源：專案內 docs/04-實作記錄與進度.md、desktop/*.test.js 執行結果，2026-11 實測。")

    h2(doc, "1.5", "一次典型使用，長什麼樣子")
    para(doc, "把它拆成動作，比較容易看出產品形狀。以下是一次完整迴圈，五個步驟：")
    rows = [
        ("① 掃描", "啟動後掃描 ~/.codex/sessions 與 ~/.claude/projects", "首次約 1.6 秒，之後靠 mtime 快取"),
        ("② 總覽", "卡片顯示工具、模型、最後一輪、狀態（在跑／待你／卡住）", "每 15 秒刷新"),
        ("③ 進入", "點卡片 → 對話全文，含每一輪的指令與結果", "可切換原始與渲染檢視"),
        ("④ 續派", "選模型 → 輸入任務 → 沿原 ID 派工", "Codex 走 app-server，Claude 走 --resume"),
        ("⑤ 核對", "回到原工具的原對話，確認本輪結果", "MaxAgent 同時給出證據定位"),
    ]
    table(doc, ["步驟", "使用者做什麼", "系統做什麼"], rows, [2.4, 7.4, 6.6], size=9,
          align=["center", "left", "left"], first_col_bold=True)

    spacer(doc, 4)
    callout(doc, "本章結論",
            "這是一個定位清楚、範圍克制的工具：它不與任何 Harness 競爭，而是寄生在它們的檔案格式上。"
            "這個選擇讓它在技術上可快速驗證（已經驗證），也讓它在商業上必須面對格式依賴的風險（第 3 章與第 10 章）。")


# ------------------------------------------------------------------ chapter 2
def chapter2(doc):
    h1(doc, "2", "技術棧盤點", "TECH STACK")
    lead(doc, "一個只有一個執行期依賴的 Electron 應用：全部的安全模型、整合方式與效能取捨，都寫在這 447 行裡。")

    h2(doc, "2.1", "選型一覽")
    para(doc, "專案的技術選擇有一個一致的原則：能用系統既有能力解決的，就不引入套件。"
              "這讓它在供應鏈安全與啟動速度上表現很好，代價是大量手寫的邊界處理。")
    rows = [
        ("執行容器", "Electron", "45.2.3", "原生視窗、托盤、通知，且能直接 spawn 本機 CLI"),
        ("介面", "原生 HTML / CSS / JS", "—", "無框架、無 bundler、無 TypeScript；啟動快、可審計"),
        ("Markdown 渲染", "marked", "18.2.0", "唯一的執行期依賴"),
        ("程序邊界", "contextBridge + IPC allowlist", "—", "渲染程序不具備 Node 能力"),
        ("本機狀態", "JSON 檔（tmp + rename）", "—", "人類可讀、可備份、無需服務"),
        ("Codex 整合", "app-server／JSON-RPC 2.0（stdio）", "codex 0.167", "官方介面，可列模型、可續 thread"),
        ("Claude 整合", "CLI --resume + stream-json", "2.1.321", "不需 SDK，沿用使用者既有登入"),
        ("模型目錄", "model/list ＋ settings.json ＋ SQLite", "—", "兩種 Harness 各用其原生來源"),
        ("測試", "node:test", "—", "零依賴，12 個測試檔、23 項案例"),
        ("打包／簽章", "尚未實作", "—", "見技術債 TD-03"),
        ("CI／lint", "尚未實作", "—", "見技術債 TD-06"),
    ]
    table(doc, ["層", "選型", "版本", "為什麼這樣選"], rows, [3.0, 5.4, 2.6, 5.4], size=8.8,
          first_col_bold=True, align=["left", "left", "center", "left"])

    h2(doc, "2.2", "架構：三層，兩個邊界")
    para(doc, "整個系統只有三層：主程序負責一切檔案與程序操作，preload 把能力縮成 13 個具名方法，"
              "渲染程序只做顯示。中間有兩個邊界——渲染程序與 preload 之間用 contextBridge，"
              "preload 與主程序之間用 IPC allowlist。這個結構的結果是：即使介面被注入惡意腳本，"
              "攻擊者也拿不到 fs 或 child_process。")
    figure(doc, "architecture.png", CONTENT_W,
           "圖 1　MaxAgent 系統架構：原工具層、桌面程式、本機資料。青綠為讀取路徑，琥珀為寫入路徑。")
    para(doc, "圖中右側的三個資料來源，構成了產品的「真相層」：Codex 的 rollout JSONL、Claude 的專案 JSONL、"
              "以及 MaxAgent 自己的 state.json。值得注意的設計是——MaxAgent 沒有資料庫。"
              "它把狀態存成單一 JSON 檔，用 tmp 檔加 rename 保證原子性。這在單機、單使用者的情境下是正確取捨："
              "免去 migration 與服務依賴，代價是併發寫入與 schema 演進要靠自律。")

    h2(doc, "2.3", "安全設計：把「本地優先」落成七條控制")
    para(doc, "對一個會讀取整台機器上所有 AI 對話的程式來說，安全性不是加分項，是入場券。"
              "專案在這方面做得比多數同類工具嚴謹：")
    rows = [
        ("渲染程序沙箱", "sandbox: true、nodeIntegration: false、contextIsolation: true", "介面被注入時，無法直接取得檔案系統"),
        ("內容安全政策", "default-src 'none'；script-src 'self'", "阻斷遠端腳本與內嵌執行"),
        ("IPC 來源驗證", "sender 必須是主視窗，且 senderFrame 必須是主框架", "防止子框架或寵物視窗越權呼叫"),
        ("能力白名單", "preload 只暴露 list／history／read／send 等 13 個具名方法", "不給通用橋接，避免能力外溢"),
        ("導航封鎖", "攔截 will-navigate 與 window.open", "外部連結無法接管應用視窗"),
        ("僅本機綁定", "舊看板只綁 127.0.0.1:7760", "避免對話內容暴露到區網"),
        ("憑證不落地", "不儲存任何 API key，沿用 CLI 既有登入", "外洩風險轉移給使用者既有的憑證管理"),
    ]
    table(doc, ["控制", "實作方式", "少了它會怎樣"], rows, [3.4, 7.6, 5.4], size=8.8, first_col_bold=True)

    h2(doc, "2.4", "與兩個 Harness 的整合方式")
    h3(doc, "Codex：走官方 app-server 的 JSON-RPC")
    para(doc, "MaxAgent spawn 一個 codex app-server 子程序，以 JSON-RPC 2.0 over stdio 完成握手："
              "initialize → initialized → thread/resume → turn/start，然後等待該輪的 turn/completed 事件。"
              "遇到互動式請求（例如要求使用者批准）一律回 -32601（method not found），讓流程不會卡在無人回應的等待上。"
              "這條路徑的好處是完全走官方介面；壞處是它與 Codex 桌面版爭奪同一個 thread 的寫入權——這正是 P0 的來源。")
    h3(doc, "Claude：走 CLI 的 --resume")
    para(doc, "Claude 這一側反而簡單：以 claude --resume <session-id> --print --verbose "
              "--output-format stream-json --tools Read,Edit,Write --permission-mode acceptEdits "
              "--permission-prompts none -- <prompt> 直接續跑。--print 讓它非互動、stream-json 讓輸出可解析、"
              "acceptEdits 讓編輯自動套用。代價是權限放得很寬（TD-14），這也是企業採購時一定會被問到的點。")
    h3(doc, "模型：兩種 Harness、三種來源")
    para(doc, "Codex 用 model/list 取得目錄（limit 100、cursor 分頁、12 秒逾時），實測回 9 個模型；"
              "Claude 沒有等價介面，於是改讀三層 settings.json 的 env 映射（ANTHROPIC_DEFAULT_SONNET_MODEL 等），"
              "再以 node:sqlite 唯讀打開 ~/.cc-switch/cc-switch.db 確認目前供應商，"
              "最後用 sha256(供應商 + 模型清單) 作為指紋——供應商一換，使用者的選擇就作廢重選。")

    h2(doc, "2.5", "效能：把 2.4 秒的掃描壓到 16 毫秒")
    para(doc, "專案對效能做過一次有紀錄的優化，手法是為每個檔案快取 (mtime, size) 與解析結果，命中就不重解析。"
              "在 41 筆對話、76 個檔案的樣本上，結果如下：")
    rows = [
        ("冷啟：列出清單", "1,648 ms", "—", "首次掃描，無快取"),
        ("冷啟：完整解析 76 檔", "2,444 ms", "—", "首次解析，含最大 58 MB 紀錄"),
        ("暖刷新（41 對話）", "567／673／571 ms", "16／17／15 ms", "mtime+size 命中，解析檔數 35 → 0"),
        ("主程序私有記憶體", "287,332／377,540 KB", "207,984／137,892 KB", "閒置／讀取最大紀錄後；單次取樣"),
        ("最大單一紀錄", "57,997,413 bytes", "—", "仍可開啟，不崩潰"),
    ]
    table(doc, ["指標", "優化前", "優化後", "說明"], rows, [4.8, 4.0, 3.8, 4.0], size=8.8,
          align=["left", "center", "center", "left"], first_col_bold=True)
    source_note(doc, "同一台 Windows 機器、同一批樣本；記憶體為單次取樣，非統計值。")

    h2(doc, "2.6", "這個技術棧的評價")
    h3(doc, "正面")
    bullet(doc, "供應鏈極小。一個執行期依賴意味著幾乎沒有 npm 生態的攻擊面，這對一個要讀取使用者全部對話的程式尤其重要。", bold_head="")
    bullet(doc, "啟動與回應快。沒有 bundler 與框架的執行期開銷，冷啟 1.6 秒、暖刷新 16 毫秒。")
    bullet(doc, "可審計。447 行生產程式碼，任何資安人員都能在半天內讀完——這在企業採購情境下是實質優勢。", bold_head="")
    h3(doc, "風險")
    bullet(doc, "手寫 DOM 與事件綁定，長期功能成長會讓 renderer.js 失控（目前已 10,017 字元、單行最長 1,016 字元）。")
    bullet(doc, "沒有型別系統，JSONL 的形狀全靠執行期防禦，上游一改欄位就是一次線上事故（TD-07）。")
    bullet(doc, "程式碼密度過高：16 個檔案只有 447 行，單行最長 1,275 字元。可讀性換來了檔案數，但也換走了可維護性（TD-05）。")

    spacer(doc, 4)
    callout(doc, "工程判斷",
            "這個技術棧是「一個人能在三個月內做完」的合理選擇，也是「五個人要一起維護」的糟糕選擇。"
            "如果產品要走到團隊與企業市場，第 3 章的 TD-05 與 TD-07 會從「不好看」變成「擋路」。")


# ------------------------------------------------------------------ chapter 3
DEBT = [
    ("TD-01", "Codex 派工寫入鎖", "thread/resume 回 -32600 already has an active writer；鎖由 codex.exe（PID 26728，父程序 ChatGPT.exe）持有", "核心承諾對 Codex 不成立", "P0", "10"),
    ("TD-02", "結果核對靠字串比對", "result-evidence.js 以文字特徵定位輪次，缺乏結構化事件", "誤判完成、漏判失敗", "P1", "3"),
    ("TD-03", "無打包、無簽章、無自動更新", "無 electron-builder／forge 設定，只能 npm start", "無法散佈，SmartScreen 攔阻", "P1", "8"),
    ("TD-04", "無版本控制", "專案目錄無 .git", "無法回溯、協作與審計", "P1", "0.5"),
    ("TD-05", "程式碼密度過高", "16 個生產 JS 檔僅 447 行，單行最長 1,275 字元", "新人與外包上手困難", "P1", "12"),
    ("TD-06", "無 CI、無 lint、無格式化", "僅手動執行 node --test 與 node --check", "回歸全靠人工把關", "P2", "2"),
    ("TD-07", "無型別（純 JS）", "JSONL 形狀靠執行期假設與防禦性判斷", "上游改欄位即崩", "P1", "15"),
    ("TD-08", "解析器重複", "harness.js 與舊看板 server.js 各有一套解析", "修一處漏一處", "P2", "3"),
    ("TD-09", "依賴私有且未文件化格式", "rollout-*.jsonl 與 projects/*.jsonl 皆非公開契約", "上游改版等於產品停擺", "P1", "10"),
    ("TD-10", "cc-switch schema 未版本化", "以 node:sqlite 唯讀直查 ~/.cc-switch/cc-switch.db", "供應商偵測失效", "P2", "2"),
    ("TD-11", "冷啟動同步阻塞", "冷啟 1,648 ms、完整解析 76 檔 2,444 ms", "大歷史使用者體驗落差", "P2", "4"),
    ("TD-12", "狀態檔無 schema 版本", "state.json 直接讀寫，無 migrate 流程", "升級後狀態遺失", "P2", "1"),
    ("TD-13", "無 i18n", "介面字串硬編碼繁體中文", "無法進入英文市場", "P1", "4"),
    ("TD-14", "權限模型過寬", "acceptEdits＋permission-prompts none＋sandbox workspace-write＋approval never", "誤改檔案；企業不敢採購", "P0", "6"),
    ("TD-15", "無逐對話金鑰與憑證隔離", "沿用使用者全域設定（MAX-013 未實作）", "多專案／多客戶混用", "P1", "8"),
    ("TD-16", "內嵌 346 MB claude.exe", "runtime/claude/claude.exe 346,487,456 bytes，Anthropic PBC 簽章", "再散布授權與更新風險", "P1", "3"),
    ("TD-17", "無遙測與崩潰回報", "無任何上報管道", "品質不可觀測", "P2", "3"),
    ("TD-18", "無授權、試用、付費", "無 license 檢查與購買流程", "無法收款", "P1", "10"),
    ("TD-19", "無取消、佇列、併發控制", "派工 fire-and-forget，20 分鐘硬逾時", "誤派無法收回", "P2", "3"),
    ("TD-20", "證據快取不持久化、歷史截斷", "MAX-006；僅留 200 則、每則截 32,000 字元", "長對話證據不完整", "P2", "2"),
]


def chapter3(doc):
    h1(doc, "3", "技術債盤點", "TECHNICAL DEBT")
    lead(doc, "20 項、約 110 人日。其中兩項為 P0，而它們不是程式碼問題，是產品定義問題。")

    figure(doc, "debt-matrix.png", CONTENT_W,
           "圖 2　技術債優先矩陣。紅＝P0／P1 且阻斷交付，琥珀＝規模化前必須處理，灰＝可排程。")
    para(doc, "把每一項放進「修復成本 × 不修的商業代價」二維圖，行動順序就浮現了。左上角是必須立即處理的，"
              "右下角是可以接受或外包的。注意這張圖的形狀：多數高代價項目集中在低成本區——這意味著這個專案的債，"
              "主要是「沒做」而不是「做錯」。")

    h2(doc, "3.1", "怎麼判定：四個維度、三個等級")
    para(doc, "技術債的評估很容易流於「程式碼不好看」。這裡改用商業語言：每一項債務都問四個問題——"
              "它會不會讓產品交不出去（可交付性）？會不會讓使用者不敢信任（可信任）？會不會讓團隊加不了人（可規模化）？"
              "會不會讓每次改動都更慢（可維護性）？四個維度中任一個被實質阻斷，就是 P0；影響交付節奏是 P1；可排程處理是 P2。")
    rows = [
        ("P0", "阻斷核心承諾或造成安全／信任風險", "必須在對外收費前關閉", "2 項"),
        ("P1", "影響交付節奏、市場進入或規模化", "進入對應階段前完成", "9 項"),
        ("P2", "可維護性與體驗的長期成本", "排入常規迭代", "9 項"),
    ]
    table(doc, ["等級", "定義", "處理時機", "數量"], rows, [2.0, 7.4, 5.0, 2.0], size=9,
          align=["center", "left", "left", "center"], first_col_bold=True)

    h2(doc, "3.2", "四個象限，四種處理策略")
    para(doc, "上圖的四個象限直接對應四種動作，不需要另一張表：左上「立即做」是 P0 與阻斷交付的 P1；"
              "右上「計劃做」需要預算與排程，主要是型別化與權限收斂；左下「順手做」隨迭代清掉；"
              "右下「接受或外包」則是那些修起來貴、但不修也活得下去的部分，例如遙測與 i18n 的早期版本。")

    h2(doc, "3.3", "完整清單")
    para(doc, "下表為全部 20 項，含可查證的證據與估計人日。人日以熟悉此專案的單一工程師計，不含溝通與審查。")
    rows = [(d[0], d[1], d[2], d[3], d[4], d[5]) for d in DEBT]
    table(doc, ["編號", "債務", "證據（可查）", "商業影響", "等級", "人日"], rows,
          [1.4, 4.2, 5.8, 2.8, 1.1, 1.1], size=7.8, header_size=8,
          align=["center", "left", "left", "left", "center", "center"])
    source_note(doc, "合計 109.5 人日，約 110 人日；以每月 21 個工作日計，約 5.2 人月。")

    h2(doc, "3.4", "P0 深潛：Codex 的 writer 鎖")
    h3(doc, "現象")
    para(doc, "當某個 Codex 對話正被 Codex 桌面程式（ChatGPT.exe 內建）持有時，MaxAgent 對它派工會失敗："
              "app-server 的 thread/resume 回傳 JSON-RPC 錯誤 -32600，訊息為 already has an active writer。"
              "在 MAX-004 的驗證裡，同一條路徑對未被持有的 thread 是完全成功的——所以這不是協定錯誤，是資源競爭。")
    h3(doc, "證據鏈")
    bullet(doc, "Windows Restart Manager 顯示鎖定該檔案的是 codex.exe（PID 26728），其父程序為 ChatGPT.exe（PID 1944）。")
    bullet(doc, "Codex app-server 預設的 control socket 不存在；嘗試以 Windows 具名管道／本機埠 10050 連線亦失敗。")
    bullet(doc, "同類專案 T3 Code 的 issue #28678 記錄了相同症狀，其解法方向是 app-server proxy 加上 JSONL↔WebSocket 橋接。")
    h3(doc, "根因")
    para(doc, "Codex 對每個 thread 只允許一個 writer。桌面程式在使用者開啟對話時就成為 writer；"
              "MaxAgent 另起一個 app-server 去 resume 同一個 thread，等於要求第二個 writer，於是被拒。"
              "問題的本質不是 MaxAgent 寫錯，而是它試圖與官方應用爭奪同一個資源——而上游沒有提供「共享 writer」的介面。")
    h3(doc, "四個選項")
    rows = [
        ("A　等上游開放", "追蹤 Codex 是否提供 external thread attach／共享 writer", "0.5 人日／月", "時程不可控", "並行，不作為主線"),
        ("B　降級為新對話", "複製任務與必要上下文，開新 thread", "2 人日", "違背核心主張", "僅作手動備案"),
        ("C　自建橋接層", "以 JSONL 為真相來源，透過本機 socket 與既有 writer 協作", "8–12 人日", "依賴未公開行為，易碎", "D 失敗後投入"),
        ("D　改走 CLI 派工", "以 Codex CLI 的 resume／exec 路徑取代 app-server", "3 人日", "需驗證是否同樣受鎖", "先做，三日内可判定"),
    ]
    table(doc, ["選項", "做法", "成本", "風險", "建議"], rows, [3.0, 6.4, 2.4, 2.6, 2.0], size=8.5,
          first_col_bold=True, align=["left", "left", "center", "left", "left"])

    h3(doc, "建議")
    para(doc, "先把 D 當成三天的技術 spike：如果 CLI 路徑不受 writer 鎖限制，P0 就以最低成本關閉，"
              "且不必依賴未公開行為；如果同樣受限，再投入 C。A 作為長線保險，B 則無論如何都要做——"
              "因為它同時是錯誤訊息改善與使用者期待管理的一部分：當派工失敗時，介面應該直接提供"
              "「複製任務並開啟 Codex」的按鈕，而不是丟一個 -32600 給使用者。")
    callout(doc, "這件事對商業計劃的意義",
            "P0 不是一個待修的功能，而是「產品承諾的適用範圍」。若 D 與 C 都失敗，MaxAgent 對 Codex 使用者的定位就必須"
            "從「原對話續派」改為「跨工具的歷史總覽 + Claude 側的原對話續派」，估值邏輯與定價都要跟著改。"
            "因此本計劃把「關閉 P0」列為第一個季度的唯一硬性里程碑。")

    h2(doc, "3.5", "償還路線：四個階段，對應四次能力跳躍")
    rows = [
        ("止血", "第 0–2 月", "TD-01（含 D／C）、TD-04、TD-06、TD-03", "22", "陌生使用者能自行安裝並完成一次續派"),
        ("可賣", "第 2–5 月", "TD-18、TD-14、TD-13、TD-02、TD-20", "25", "能收款、能稽核、能給企業看"),
        ("可規模", "第 5–10 月", "TD-05、TD-07、TD-09、TD-15、TD-11", "49", "能加人、能接第三個 Harness"),
        ("可選", "其餘空檔", "TD-08、TD-10、TD-12、TD-16、TD-17、TD-19", "14", "降低長期維護成本"),
    ]
    table(doc, ["階段", "期間", "處理項目", "人日", "完成後的產出"], rows, [2.2, 2.6, 7.4, 1.6, 4.0],
          size=8.5, align=["center", "center", "left", "center", "left"], first_col_bold=True)
    para(doc, "把 110 人日換成錢：以每月 21 個工作日、全載人力成本每月 6,000 美元計，約 5.2 人月，"
              "折合 3.1 萬美元。這個數字遠小於一般種子輪的「技術重整」預算，"
              "原因是專案的債多半是「缺流程」而非「錯架構」——這對投資人其實是好消息。")

    spacer(doc, 4)
    callout(doc, "本章結論",
            "這份技術債清單的價值不在長度，而在它把「能不能交貨」變成了可排程的工作。"
            "110 人日、3.1 萬美元、兩個 P0——如果這三件事在 6 個月內被解決，產品就從「演示」進入「可賣」。"
            "反過來說，任何跳過 P0 直接談成長的計劃，都是不誠實的。")


# ------------------------------------------------------------------ chapter 4
def chapter4(doc):
    h1(doc, "4", "市場分析", "MARKET")
    lead(doc, "一個真實但偏小的市場：多 Agent 並用的開發者。規模不大，但付費意願與傳播效率都很高。")

    h2(doc, "4.1", "三個結構性變化")
    para(doc, "這個產品的存在理由，來自 2024 年之後發生的三件事。它們不是趨勢預測，而是已經發生的行為改變。")
    numbered(doc, 1, "Agent 從「補全」變成「執行」。",
             "2023 年的 AI 編碼是補一行、補一個函式；2025 年的 Agent 會自己讀檔、改檔、跑測試，一個任務動輒十分鐘到數小時。"
             "任務變長，對話就變成一種資產——而資產需要被管理。")
    numbered(doc, 2, "多工具並用成為常態，而不是過渡。",
             "JetBrains 2025 年調查顯示 85% 開發者定期使用 AI 工具；其中相當比例同時使用兩個以上（例如 Claude Code 寫重構、"
             "Codex 跑長任務）。工具沒有收斂成一個，反而因為模型能力差異而分眾。")
    numbered(doc, 3, "桌面成為 Agent 的主戰場。",
             "2025 年下半年，OpenAI 與 Anthropic 都把 Agent 從終端搬到桌面應用。桌面意味著更長的任務、更多的檔案權限、"
             "以及更強的「工作台」需求——而多數編排工具仍停留在 macOS 優先或純終端。")

    h2(doc, "4.2", "市場規模：從開發者人口往下推")
    para(doc, "這一節刻意把假設攤開，讓讀者可以自己改參數。推導路徑是：開發者總數 → 多 Agent 並用比例 → 願付費比例 → 年 ARPU。")
    rows = [
        ("全球開發者人口", "2,700 萬 – 4,700 萬", "SlashData 2025；下限為專業開發者，上限含業餘與學生"),
        ("同時使用 2 個以上 Agent", "2.6% – 3.0%", "以 AI 使用者中約三分之一使用多工具估算，再乘上 AI 採用率"),
        ("可服務人數（TAM）", "70 萬 – 141 萬人", "開發者人口 × 多工具比例"),
        ("TAM 金額", "US$88M – 176M", "× 年 ARPU 125 美元"),
        ("SAM（Windows × 語言 × 願付費）", "US$31M – 62M", "TAM 的 35%；Windows 佔比、華語與英語市場、付費轉換"),
        ("SOM（三年可取得）", "3,500 – 9,000 名付費用戶", "SAM 的 1.4% – 3.6%"),
        ("SOM 對應 ARR", "US$0.44M – 1.13M", "× 年 ARPU 125 美元"),
    ]
    table(doc, ["層級", "數值", "推導與說明"], rows, [4.6, 4.6, 7.0], size=8.8, first_col_bold=True)
    source_note(doc, "開發者人口見 SlashData《Developer Population》；AI 採用率見 JetBrains 2025 開發者調查（Infoworld 報導）。"
                     "多工具比例為本團隊估算，方法公開可辯論。")

    para(doc, "必須誠實說：以創投標準，這是一個「小市場」。TAM 不到 2 億美元，SOM 不到 1,200 萬美元 ARR。"
              "但這個市場有三個特質讓它值得做：客單價高（專業工具）、傳播成本低（開發者社群天然擴散）、"
              "以及轉換成本低到可以「試了再說」——這對一個獨立團隊是理想條件，對一個要衝十億美元估值的團隊則不是。")

    h2(doc, "4.3", "競爭版圖：沒有人站在完全相同的位置")
    rows = [
        ("Codex 桌面版", "官方桌面應用", "深度整合、官方支援、內建瀏覽器", "是「原工具」，不是競品——MaxAgent 寄生其上"),
        ("Claude Code", "CLI＋桌面", "長任務、終端體驗、--resume 能力", "同上；它的 --resume 正是 MaxAgent 的整合點"),
        ("Cursor／Windsurf", "AI IDE", "編輯器內一站式體驗", "只用一個工具的人不需要 MaxAgent"),
        ("Conductor", "macOS 多 Agent 工作區", "並行任務、git worktree 隔離", "最接近的競品；macOS 優先、以「新任務」為單位"),
        ("Vibe Kanban", "任務看板", "視覺化管理 Agent 任務", "以任務為單位，不回到原對話"),
        ("T3 Code", "多 Harness 殼層", "同樣遭遇 app-server 鎖（issue #28678）", "技術先行者；驗證了 P0 的普遍性"),
        ("自建 Harness（DSH 等）", "個人化 runtime", "完全掌控、可深度客製", "潛在整合對象而非對手（MAX-012）"),
    ]
    table(doc, ["產品", "形態", "強項", "對 MaxAgent 的意義"], rows, [3.6, 3.8, 5.0, 5.0], size=8.4,
          first_col_bold=True)

    para(doc, "從這張表可以讀出兩件事。第一，MaxAgent 的差異化不在功能清單，而在「單位」：多數工具以任務或工作區為單位，"
              "它以原對話為單位。第二，最接近的競品（Conductor、Vibe Kanban、Crystal 一類）幾乎都以 macOS 或 Web 為主，"
              "Windows 原生、且願意處理 Windows 檔案鎖與通知的產品是空白——這是一個可以被佔住的縫隙。")

    h2(doc, "4.4", "為什麼是現在")
    bullet(doc, "Windows 的空白：主流多 Agent 編排工具 macOS 優先，Windows 版往往延後半年以上。", bold_head="")
    bullet(doc, "官方開始做桌面：Codex 與 Claude 的桌面化，讓「本機對話檔案」成為穩定介面，也讓第三方有東西可接。")
    bullet(doc, "格式穩定期：rollout JSONL 與 projects JSONL 已穩定數月，足以支撐一個產品的解析層（同時也是風險）。")
    bullet(doc, "信任紅利：企業對「把程式碼上傳到第三方 SaaS」越來越敏感，本地優先從賣點變成門檻。")

    h2(doc, "4.5", "市場的殘酷面")
    para(doc, "有三個因素會壓縮這個市場，必須寫進計劃而不是留給讀者發現：")
    numbered(doc, 1, "平台方可能直接做掉。",
             "如果 Codex 或 Claude 官方推出「跨工具歷史總覽」，MaxAgent 的價值會被吃掉一半。"
             "這是最真實的風險，也是為什麼產品必須往「跨多個 Harness」而不是「單一 Harness 的增強」發展。")
    numbered(doc, 2, "工具疲勞。",
             "開發者已經被太多 AI 工具轟炸，「再裝一個」的門檻比想像中高。這要求產品必須在三分鐘內展示價值，"
             "而不是要求使用者先讀文件、配置環境。")
    numbered(doc, 3, "付費天花板低。",
             "個人開發者對工具的付費習慣是每月 10–20 美元，且極易因「官方免費替代」而退訂。"
             "這使得 Team 與 Enterprise 席位成為營收能否突破的關鍵（第 6 章）。")

    spacer(doc, 4)
    callout(doc, "本章結論",
            "市場夠真實、夠早、也夠小。這個組合的正確打法不是「快速擴張」，而是「用極低的行銷成本取得第一批 1,000 名付費者，"
            "再用他們的團隊關係往上賣」。任何以「開發者總數 × 1%」推導出來的樂觀數字，都應該被丟掉。")


# ------------------------------------------------------------------ chapter 5
def chapter5(doc):
    h1(doc, "5", "產品與定位", "PRODUCT")
    lead(doc, "三個「不」構成價值主張；一條 12 個月的路線圖決定它能不能從工具變成產品。")

    h2(doc, "5.1", "價值主張：三個不")
    para(doc, "市場上不缺「管理 AI 任務」的工具，缺的是「不要求你改變工作方式」的工具。MaxAgent 的主張可以壓成三句否定句：")
    rows = [
        ("不換工具", "你繼續用 Codex 和 Claude Code，MaxAgent 只是它們之上的一層視窗。", "學習成本趨近於零；不必重新建立肌肉記憶。"),
        ("不複製對話", "續派發生在原 thread／原 session，前文不需要重貼。", "省 token、避免上下文漂移、原紀錄保持完整。"),
        ("不交憑證", "不儲存 API key、不上傳對話，沿用你既有的 CLI 登入。", "企業資安可以直接放行；個人使用者不必信任一間新公司。"),
    ]
    table(doc, ["主張", "具體含義", "對使用者的實質好處"], rows, [3.0, 7.6, 5.8], size=9, first_col_bold=True)

    h2(doc, "5.2", "定位聲明")
    callout(doc, "定位",
            "給同時跑 Codex 與 Claude Code 的 Windows 開發者：MaxAgent 是唯一不換工具、不複製對話的工作台——"
            "你在哪裡開始，就在哪裡結束。",
            fill=SAND, bar="B06C1E")
    para(doc, "這句話刻意寫得很窄。「同時跑兩個」排除了單一工具使用者；「Windows」排除了 macOS 使用者；"
              "「不換工具」排除了想要一站式 IDE 的人。窄的好處是：被排除的人不會下載，下載的人不會失望。")

    h2(doc, "5.3", "三種人，三種買法")
    rows = [
        ("個人進階開發者", "同時訂閱 Codex 與 Claude，每天 3 個以上 Agent 任務，自己付費", "上下文重建耗時、結果核對靠記憶", "Pro 9 美元／月，或終身 149 美元"),
        ("2–8 人團隊 Tech Lead", "要 review 團隊的 Agent 產出，關心「誰派了什麼、改了什麼」", "無法追蹤、無法稽核、無法交接", "Team 19 美元／席位"),
        ("AI 自動化研究者", "大量實驗、比較不同模型與 Harness、需要回顧", "實驗散落、難以重現", "Pro 或 Team；對價格不敏感"),
    ]
    table(doc, ["人設", "特徵", "痛點", "付費意願"], rows, [3.4, 6.2, 4.2, 3.6], size=8.6, first_col_bold=True)
    para(doc, "三種人之中，第一種是產品的種子，第二種是營收的來源，第三種是口碑的放大器。"
              "這也決定了功能優先級：先把第一種人的日常迴圈做順（P0、打包、未讀），再為第二種人補上稽核與授權，"
              "最後才為第三種人做實驗管理。")

    h2(doc, "5.4", "差異化：四個維度上的位置")
    rows = [
        ("工作單位", "任務／工作區", "原對話（thread／session）", "唯一以「延續既有紀錄」為核心的設計"),
        ("執行位置", "雲端沙箱或 IDE 內", "使用者本機、原工具程序", "檔案與環境完全一致，無同步問題"),
        ("憑證模型", "平台代管或自帶 key", "沿用 CLI 既有登入", "企業資安審查最容易通過"),
        ("平台", "macOS／Web 優先", "Windows 原生", "佔住被忽略的平台縫隙"),
    ]
    table(doc, ["維度", "多數競品", "MaxAgent", "為什麼這構成差異"], rows, [3.0, 4.6, 4.6, 4.2], size=8.6,
          first_col_bold=True)

    h2(doc, "5.5", "12 個月路線圖")
    para(doc, "路線圖以「退出條件」而非「功能清單」定義版本——每一個版本都要能用一句話說明「使用者現在能多做什麼」。")
    rows = [
        ("v0.2", "第 0–3 月", "關閉 P0、打包與簽章、Git 與 CI、未讀徽章、通知修正", "陌生使用者可自行安裝，並完成一次成功的續派"),
        ("v0.3", "第 3–6 月", "授權與付費、自動更新、英文介面、可選的崩潰回報", "前 100 名付費者，退款率低於 5%"),
        ("v1.0", "第 6–12 月", "第三個 Harness（DSH／OpenCode）、任務佇列、手機配對（MAX-014）", "1,000 名付費者，週留存 35%"),
        ("v1.x", "第 12–18 月", "總指揮 Agent 代派（MAX-015）、Team 管理台", "團隊客單價超過 3 個席位"),
    ]
    table(doc, ["版本", "時間", "主要內容", "退出條件"], rows, [2.0, 2.4, 7.2, 5.0], size=8.6,
          align=["center", "center", "left", "left"], first_col_bold=True)

    h2(doc, "5.6", "產品紀律：三件堅持不做的事")
    bullet(doc, "不做自己的 Agent。一旦開始托管模型與推理，就會與整合對象變成競爭關係，也失去「本地優先」的信任基礎。")
    bullet(doc, "不做雲端同步（前期）。跨裝置同步聽起來是需求，實際上是把「不上傳」的賣點親手拆掉；真要做，也必須是端到端加密且可關閉。")
    bullet(doc, "不為單一 Harness 做深度客製。哪個 Harness 給的介面穩定，就先接哪個；不為任何一家做專屬功能，避免被單一平台綁死。")

    spacer(doc, 4)
    callout(doc, "本章結論",
            "這個產品的形狀是「薄而深」：介面薄，但對底層格式的理解深。它不需要打敗任何一個 Agent，"
            "只需要在「使用者同時用兩個 Agent」這個場景裡，成為最不壞的選擇。而這個場景，正在變多。")


# ------------------------------------------------------------------ chapter 6
def chapter6(doc):
    h1(doc, "6", "商業模式", "BUSINESS MODEL")
    lead(doc, "不從 token 抽成、不做雲端代理。收入來自「讓人願意每天開它」的那一層。")

    h2(doc, "6.1", "定價結構")
    rows = [
        ("Free", "0", "個人試用", "1 個 Harness、歷史唯讀、看板總覽、每日 3 次派工", "多 Harness、模型記憶、通知"),
        ("Pro", "US$9／月\n（年付 90）", "個人開發者", "無限 Harness 與派工、逐聊天室模型、主題與寵物、通知", "團隊協作、稽核日誌"),
        ("Team", "US$19／席位／月", "2–20 人團隊", "共享看板、稽核日誌、席位管理、優先支援", "SSO、自架部署"),
        ("Enterprise", "US$8,000／年起", "20 人以上", "自架部署、SSO／SAML、DLP 政策、合約與 SLA", "—"),
        ("Lifetime", "US$149（限量 500 份）", "早期支持者", "Pro 永久授權，不含 Team 功能", "未來企業功能"),
    ]
    table(doc, ["方案", "價格", "對象", "包含", "刻意不含"], rows, [2.2, 3.4, 2.8, 5.4, 2.6], size=8.6,
          first_col_bold=True)
    para(doc, "定價的三個參照點：一是同類開發者工具的習慣區間（每月 10–20 美元）；二是它替代的成本"
              "（一次上下文重建大約浪費 10–20 分鐘與數千 token）；三是企業採購的心理門檻（年費 8,000 美元以下通常不需要走完整採購流程）。"
              "Lifetime 方案是刻意設計的現金流工具：500 份 × 149 美元 ≈ 7.5 萬美元，足以支撐 v0.2 到 v0.3 的開發，"
              "代價是未來幾年的邊際收入。")

    h2(doc, "6.2", "為什麼不從 token 抽成")
    para(doc, "最直覺的變現方式是「按使用量抽成」，但它會摧毀這個產品的三個基礎：")
    numbered(doc, 1, "它會逼產品托管憑證。",
             "要抽成，就必須知道用了多少 token；要知道用量，就得代管使用者的 API key 或代理請求。"
             "這與「不交憑證」的定位直接衝突，也會讓企業資安審查從一週變成三個月。")
    numbered(doc, 2, "它會讓產品與使用者對立。",
             "抽成模式下，使用者越省 token，公司越不賺錢。而這個產品的存在意義，恰恰是幫使用者省下重貼上下文的 token。"
             "商業模式與產品價值互相抵消，是最糟的設計。")
    numbered(doc, 3, "它會綁死單一供應商。",
             "抽成需要與模型供應商結算，一旦綁定，就無法中立地支援第三、第四個 Harness——而那正是產品的長期方向。")
    para(doc, "因此收入模型選擇「席位訂閱」：賣的是工作流的順暢度，不是模型的使用量。這也讓毛利結構非常乾淨——"
              "沒有推論成本，只有支付手續費與更新頻寬。")

    h2(doc, "6.3", "單位經濟")
    rows = [
        ("年 ARPU（混合）", "US$125", "Pro 9 美元與 Team 19 美元混合後，約每月 10.4 美元"),
        ("毛利率", "92%", "成本為支付手續費約 3%、更新與簽章頻寬約 5%"),
        ("年流失率", "18%", "開發者工具的典型區間（15%–25%），假設偏樂觀"),
        ("LTV", "US$639", "125 × 92% ÷ 18%"),
        ("CAC", "US$120", "以內容與社群為主，幾乎沒有付費投放"),
        ("LTV／CAC", "5.3 倍", "健康的 SaaS 門檻為 3 倍"),
        ("CAC 回收期", "12.5 個月", "120 ÷（125 × 92% ÷ 12）"),
        ("免費轉付費", "3.5%", "以月活為分母；開發者工具的常見區間 2%–5%"),
    ]
    table(doc, ["指標", "數值", "說明"], rows, [4.2, 3.4, 8.8], size=9,
          align=["left", "center", "left"], first_col_bold=True)

    para(doc, "12.5 個月的回收期偏長，這是低價訂閱的結構性問題。解法不是漲價，而是拉高混合客單："
              "當 Team 席位佔付費用戶的 15% 以上時，混合 ARPU 會從 125 上升到 150 左右，回收期縮短到 10 個月以內。"
              "這也是為什麼第 7 章把「團隊關係」而不是「個人下載量」列為第二年的主要指標。")

    h2(doc, "6.4", "付費牆的三條原則")
    bullet(doc, "免費版必須能完成一次完整的價值體驗：看到所有對話、讀歷史、每天派三次工。使用者要能自己得出「這東西有用」的結論。", bold_head="")
    bullet(doc, "付費牆放在「頻率」與「廣度」，不放在「正確性」。多 Harness、無限派工、模型記憶收費；但結果核對、錯誤提示、安全性永遠免費。")
    bullet(doc, "不鎖自己的資料。免費用戶的狀態檔、歷史、設定永遠可以完整匯出——這既是信任，也是離場成本的反向操作。")

    h2(doc, "6.5", "從個人到團隊：為什麼 Enterprise 對 P0 特別敏感")
    para(doc, "個人使用者可以接受「偶爾派工失敗，重開就好」；團隊與企業不能。一旦某個對話被同事的 Codex 視窗佔用，"
              "而系統只回一個 -32600，這是無法寫進 SOP 的行為。因此 P0（TD-01）與權限模型（TD-14）"
              "不是技術優先級，而是銷售優先級：沒有它們，Team 與 Enterprise 方案根本無法報價。")

    spacer(doc, 4)
    callout(doc, "本章結論",
            "這是一個「低價、高毛利、低行銷費用」的商業模型，適合獨立團隊與小型公司，不適合需要快速衝規模的創投劇本。"
            "它的財務紀律要求很高：一旦開始付費投放，5.3 倍的 LTV/CAC 會迅速惡化。")


# ------------------------------------------------------------------ chapter 7
def chapter7(doc):
    h1(doc, "7", "進入市場策略", "GO-TO-MARKET")
    lead(doc, "沒有預算打廣告，所以只能用「值得被轉發的東西」換取注意力。")

    h2(doc, "7.1", "三段式路徑")
    rows = [
        ("第一段：0 → 1,000 名付費", "第 0–9 月", "社群冷啟動、技術內容、早期支持者", "驗證願意付費的人真的存在"),
        ("第二段：1,000 → 10,000 名付費", "第 9–24 月", "口碑、整合第三個 Harness、團隊方案", "驗證產品能跨越「個人工具」邊界"),
        ("第三段：10,000 以上", "第 24 月之後", "企業直銷、生態整合、可能的併購", "驗證它能成為一門穩定生意"),
    ]
    table(doc, ["階段", "時間", "主要手段", "要驗證什麼"], rows, [4.6, 2.6, 5.2, 4.0], size=9, first_col_bold=True)
    para(doc, "本計劃書只對第一段做出承諾，第二段給方向，第三段給選項。這是刻意的：在 P0 關閉之前，"
              "任何超過 1,000 名付費者的預測都是空話。")

    h2(doc, "7.2", "通路與成本")
    rows = [
        ("技術社群（HN、Reddit、X）", "以「我們如何處理 Codex 的 writer 鎖」為題發文", "0", "1,500", "最高效；但只能成功一次"),
        ("GitHub 開源周邊", "開源解析層與格式文件，主程式閉源", "0", "800", "建立技術信任與貢獻者"),
        ("開發者電子報", "付費置入 3–5 家（如 TLDR、Bytes）", "US$3,000／次", "2,000", "可預測，但要選對受眾"),
        ("Product Hunt", "一次正式發布", "0", "1,200", "適合做聲量，不適合做留存"),
        ("內容 SEO", "長尾：「Codex 對話紀錄在哪」「Claude resume 用法」", "時間", "600", "慢，但複利"),
        ("企業直銷", "從 Team 使用者中找 20 人以上的組織", "人力", "—", "客單最高，週期最長"),
    ]
    table(doc, ["通路", "動作", "成本", "預期 CAC（美元）", "備註"], rows, [3.8, 5.6, 2.6, 2.2, 2.8], size=8.2,
          align=["left", "left", "center", "center", "left"], first_col_bold=True)

    h2(doc, "7.3", "內容策略：把技術債寫成行銷素材")
    para(doc, "這個專案最特別的行銷資產，是它解決過的問題本身。Codex 的 -32600 writer 鎖、"
              "Claude 的 --resume 與 stream-json 解析、cc-switch 的供應商指紋——這些都是開發者會搜尋、"
              "但網路上幾乎沒有中文（甚至英文）完整解法的題目。把除錯過程寫成公開文章，等同於用工程換流量。")
    bullet(doc, "第一篇：〈為什麼你的 Codex 對話不能被第二個程式接手〉——直接對應 P0，預期是系列中流量最高的一篇。", bold_head="")
    bullet(doc, "第二篇：〈Claude Code 的 resume 到底是怎麼運作的〉——拆解 --resume 與 stream-json，附可執行的最小範例。")
    bullet(doc, "第三篇：〈447 行寫一個 Electron 工作台〉——用技術密度本身作為賣點，吸引「想讀程式碼」的人。")

    h2(doc, "7.4", "漏斗與目標")
    rows = [
        ("下載", "12,000", "60,000", "180,000", "社群與內容"),
        ("首次啟動", "60%", "62%", "65%", "安裝流程與簽章"),
        ("綁定至少一個 Harness", "45%", "48%", "50%", "首次啟動引導"),
        ("週活（WAU／MAU）", "25%", "28%", "30%", "日常迴圈是否夠順"),
        ("下載 → 付費", "2.7%", "2.4%", "2.4%", "免費版價值是否足夠"),
        ("平均付費用戶", "320", "1,450", "4,300", "對應第 8 章營收"),
    ]
    table(doc, ["階段", "Y1", "Y2", "Y3", "關鍵驅動"], rows, [5.0, 2.6, 2.6, 2.8, 3.4], size=8.8,
          align=["left", "center", "center", "center", "left"], first_col_bold=True)

    h2(doc, "7.5", "競爭反應預案")
    rows = [
        ("官方推出跨工具歷史", "Codex 或 Claude 宣布支援讀取對方紀錄", "立刻轉向「跨三個以上 Harness」與「團隊稽核」，並強調本地與可離線"),
        ("Conductor 推出 Windows 版", "同一季度內發布", "以「不換工作單位」與價格差異化；避免功能對撞"),
        ("上游關閉 JSONL 讀取", "格式改為加密或資料庫", "啟動 C 方案（橋接層），並把 Enterprise 自架方案提前"),
        ("大廠免費提供同類功能", "Cursor 內建跨工具看板", "收縮到「Windows + 本地 + 多 Harness」的窄定位，接受較小市場"),
    ]
    table(doc, ["情境", "觸發訊號", "反應"], rows, [4.4, 5.4, 6.6], size=8.6, first_col_bold=True)

    spacer(doc, 4)
    callout(doc, "本章結論",
            "這個產品的成長曲線不會是陡的。它靠的是「一個開發者說服另一個開發者」的慢速擴散，"
            "所以真正的指標不是下載量，而是「綁定第一個 Harness 的比例」——那才是使用者真的開始用它工作的時刻。")


# ------------------------------------------------------------------ chapter 8
def chapter8(doc):
    h1(doc, "8", "財務預測", "FINANCIALS")
    lead(doc, "三年、40 萬美元、第 4 年上半年轉正。所有數字都建立在「P0 於第一季關閉」這個前提上。")

    h2(doc, "8.1", "核心假設")
    rows = [
        ("付費用戶（年平均）", "320", "1,450", "4,300", "見第 7 章漏斗"),
        ("年 ARPU（美元）", "105", "115", "125", "Pro 與 Team 混合，Team 佔比逐升"),
        ("營收（千美元）", "34", "167", "538", "用戶 × ARPU"),
        ("年末付費用戶", "476", "2,600", "9,000", "由 ARR 反推"),
        ("年末 ARR（千美元）", "50", "299", "1,125", "年末用戶 × ARPU"),
    ]
    table(doc, ["項目", "Y1 2027", "Y2 2028", "Y3 2029", "說明"], rows, [4.6, 3.0, 3.0, 3.0, 2.8], size=8.6,
          align=["left", "center", "center", "center", "left"], first_col_bold=True)
    para(doc, "「營收」與「ARR」的落差需要解釋：營收是全年平均用戶的總和，ARR 是年末時點的年度化收入。"
              "Y3 的 538 千美元營收對應 1,125 千美元 ARR，是因為用戶在年內快速成長——這是高速成長期的正常現象，"
              "但也意味著 Y4 的營收會遠高於 Y3，這也是現金流能在 Y4 轉正的原因。")

    h2(doc, "8.2", "三年損益")
    rows = [
        ("營收", "34", "167", "538"),
        ("人力成本", "60", "240", "430"),
        ("行銷與社群", "15", "40", "80"),
        ("基礎設施與簽章", "11", "18", "40"),
        ("法務與會計", "12", "15", "25"),
        ("其他營運", "14", "13", "25"),
        ("總成本", "112", "326", "600"),
        ("EBITDA", "−78", "−159", "−62"),
        ("累計現金流", "−78", "−237", "−300"),
    ]
    table(doc, ["項目（千美元）", "Y1", "Y2", "Y3"], rows, [7.4, 3.0, 3.0, 3.0], size=9,
          align=["left", "center", "center", "center"])
    source_note(doc, "人力以全載成本計（含勞健保與設備），Y1 為 2 名兼職、Y2 為 3.5 名全職、Y3 為 6 名全職。")

    figure(doc, "financials.png", 15.4,
           "圖 3　三年營收與成本（千美元），下方為年末 ARR。Y3 仍為虧損，但缺口已收斂到 6.2 萬美元。")

    h2(doc, "8.3", "現金與資金需求")
    rows = [
        ("期初現金", "400", "322", "163"),
        ("淨現金流", "−78", "−159", "−62"),
        ("期末現金", "322", "163", "101"),
        ("累計資金需求", "—", "237", "300"),
    ]
    table(doc, ["（千美元）", "Y1", "Y2", "Y3"], rows, [7.4, 3.0, 3.0, 3.0], size=9,
          align=["left", "center", "center", "center"])
    para(doc, "建議募資 400 千美元：其中 300 千美元為三年累計缺口，100 千美元為緩衝（約 6 個月固定成本）。"
              "若不募資，以現有節奏與兼職人力，產品可以在 12 個月內關閉 P0 並開始收費，但會失去「第一季關閉 P0」的窗口，"
              "而那個窗口正是第 4 章所說的「Windows 空白」尚存的時間。")

    h2(doc, "8.4", "資金用途")
    rows = [
        ("工程（含 P0 與技術債）", "220", "55%", "5.2 人月的債 + 12 個月的新功能開發"),
        ("設計與使用者體驗", "60", "15%", "安裝流程、首次啟動引導、看板資訊密度"),
        ("行銷與社群", "60", "15%", "電子報置入、內容製作、社群經營"),
        ("法務、合規與簽章", "32", "8%", "程式碼簽章憑證、EULA、商標、隱私政策"),
        ("緩衝", "28", "7%", "匯率、上游延誤、臨時外包"),
    ]
    table(doc, ["用途", "金額（千美元）", "佔比", "說明"], rows, [5.4, 3.2, 2.0, 5.8], size=9,
          align=["left", "center", "center", "left"], first_col_bold=True)

    h2(doc, "8.5", "敏感度：三種世界")
    rows = [
        ("保守", "3,500", "437", "480", "P0 延後一季、Team 採用不如預期；需要第二輪或裁減至 2 人"),
        ("基準", "9,000", "1,125", "300", "本計劃書情境；Y4 上半年轉正"),
        ("樂觀", "15,000", "1,875", "210", "第三個 Harness 帶來跨圈層成長；可提前轉正並擴編"),
    ]
    table(doc, ["情境", "Y3 年末付費用戶", "Y3 ARR（千美元）", "累計資金需求（千美元）", "含義"], rows,
          [2.0, 3.4, 3.4, 3.6, 4.0], size=8.6,
          align=["center", "center", "center", "center", "left"], first_col_bold=True)
    para(doc, "保守情境是最值得注意的一欄：它不需要產品失敗，只需要「P0 晚一季」加上「Team 轉換率低於預期」，"
              "資金需求就會從 30 萬漲到 48 萬。這也是為什麼本計劃把 P0 放在第一個季度，而不是「有空再說」。")

    h2(doc, "8.6", "回本與退出視角")
    para(doc, "以基準情境，累計投入 30 萬美元，Y4 稅前利潤轉正，Y5 累計現金流回正。以 5 倍 ARR 的開發者工具估值中位數計算，"
              "Y5 的企業價值約在 800 萬至 1,200 萬美元之間——這是一個「對創辦人很好的結果，對創投不夠好」的回報結構。"
              "因此本計劃的資金來源應優先考慮：策略天使（Harness 生態相關）、開發者工具領域的微型基金、以及產品自身的 Lifetime 收入，"
              "而不是追求高估值的機構輪。")

    spacer(doc, 4)
    callout(doc, "本章結論",
            "財務模型的最大風險不是營收不足，而是「P0 延誤」造成的資金需求上升與時間窗口關閉。"
            "在這個模型裡，工程進度就是財務變數——這也是為什麼第 9 章把季度里程碑寫得比功能清單更細。")


# ------------------------------------------------------------------ chapter 9
def chapter9(doc):
    h1(doc, "9", "執行計畫", "EXECUTION")
    lead(doc, "四個季度，每個季度只有一個「不能失敗」的目標。其餘都是加分。")

    h2(doc, "9.1", "季度里程碑")
    rows = [
        ("Q1", "第 0–3 月", "關閉 P0（TD-01）、Git 與 CI、打包簽章、未讀徽章", "發第一篇技術文；建立 Discord", "陌生使用者可自行安裝並完成一次續派"),
        ("Q2", "第 3–6 月", "授權與付費（TD-18）、英文介面（TD-13）、自動更新", "Product Hunt；3 家電子報", "首 100 名付費，退款率 < 5%"),
        ("Q3", "第 6–9 月", "第三個 Harness 試接（DSH）、任務佇列（TD-19）、權限收斂（TD-14）", "20 場團隊訪談；Team 方案內測", "500 名付費，Team 席位 ≥ 40"),
        ("Q4", "第 9–12 月", "手機配對雛形（MAX-014）、效能與穩定性（TD-11）", "企業試點 3 家；年度回顧內容", "1,000 名付費，週留存 35%"),
    ]
    table(doc, ["季度", "時間", "工程目標", "成長動作", "里程碑（唯一硬指標）"], rows,
          [1.4, 2.4, 6.4, 3.6, 4.4], size=8.2,
          align=["center", "center", "left", "left", "left"], first_col_bold=True)

    h2(doc, "9.2", "團隊配置")
    rows = [
        ("產品工程", "1.0（Y2 起 2.0）", "整合層、P0、打包、效能", "60"),
        ("設計", "0.5", "看板資訊密度、首次啟動引導、安裝流程", "30"),
        ("成長與社群", "0.5（Y3 起 1.0）", "內容、社群、客服、電子報", "30"),
        ("兼職法務與會計", "—", "合約、稅務、簽章與商標", "12"),
        ("合計（Y1 全載）", "2.0 FTE", "其中工程為兼職投入，Y1 實際人力成本 60 千美元", "132"),
    ]
    table(doc, ["角色", "人數（FTE）", "職責", "年成本（千美元）"], rows, [4.0, 3.4, 6.6, 3.0], size=8.8,
          align=["left", "center", "left", "center"], first_col_bold=True)
    para(doc, "這個配置刻意不設專職 PM 與專職 QA。原因不是省錢，而是產品還小：在 1,000 名付費者之前，"
              "PM 的工作由創辦人與客服紀錄共同承擔，QA 的工作由自動測試與使用者回報承擔。"
              "真正的缺口是設計——看板的資訊密度與首次啟動體驗，直接決定 3.5% 的免付費轉換能不能成立。")

    h2(doc, "9.3", "交付制度：沿用專案既有的批次紀律")
    para(doc, "這個專案原本就有一套值得保留的工作方式：以 MAX-00x 編號的批次交付，每一批有明確的完成標準與停止點，"
              "而且要求「證據導向」——沒有實際跑過、沒有紀錄，就不算完成。這套制度在擴編後反而是資產，因為它讓新人不必猜「什麼叫做完」。")
    bullet(doc, "每一批不超過 3 人日，超過就拆。這是為了讓「停止點」真的能停。", bold_head="")
    bullet(doc, "每一批交付必須附三樣證據：測試輸出、實機截圖或錄影、以及已知限制。")
    bullet(doc, "每批結束後更新 docs/04-實作記錄與進度.md，包含效能數字與未解問題。")
    bullet(doc, "P0 修復期間凍結新功能：這是唯一允許的「插隊」，且必須有退出條件。")

    h2(doc, "9.4", "品質門檻（對外承諾）")
    rows = [
        ("冷啟動到可操作", "< 1.5 秒", "以 40 筆對話、76 個檔案的樣本量測"),
        ("暖刷新延遲", "< 50 毫秒", "快取命中情境"),
        ("崩潰率", "< 1% 工作階段", "以可選的崩潰回報統計"),
        ("派工成功率", "> 95%（排除 writer 占用）", "以本機日誌統計，區分失敗階段"),
        ("關鍵路徑測試", "100% 覆蓋", "掃描、解析、派工、狀態寫入四條路徑"),
        ("安裝成功率", "> 98%", "以首次啟動完成率代替"),
    ]
    table(doc, ["指標", "門檻", "量測方式"], rows, [5.4, 4.6, 6.4], size=8.8, first_col_bold=True)

    spacer(doc, 4)
    callout(doc, "本章結論",
            "整個執行計畫只有一個真正的賭注：Q1 能不能關掉 P0。如果 Q1 成功，後面三個季度就是把「可安裝」推進到「可收款」的線性工作；"
            "如果 Q1 失敗，正確的動作不是加速，而是重新定義產品承諾（第 3 章第 4 節的 B 方案），並把財務模型切換到保守情境。")


# ------------------------------------------------------------------ chapter 10
def chapter10(doc):
    h1(doc, "10", "風險登記簿", "RISKS")
    lead(doc, "12 項風險，每一項都給觸發指標。風險管理的價值不在列舉，而在「什麼時候該改變主意」。")

    rows = [
        ("R1", "Codex writer 鎖無法繞過", "技術", "中", "極高", "改走 CLI（D）；若仍失敗，投入橋接層（C）；最後降級為 Claude-only 承諾", "D 驗證失敗"),
        ("R2", "上游格式變更", "技術", "高", "高", "解析層抽象化（TD-07、TD-09）；建立格式回歸測試樣本庫", "單一 harness 解析失敗率 > 2%"),
        ("R3", "官方免費提供同類功能", "市場", "中", "高", "收縮到跨三個 Harness 與團隊稽核；強調本地與可離線", "Codex／Claude 發布跨工具歷史"),
        ("R4", "內嵌 claude.exe 授權爭議", "法務", "中", "高", "改為首次啟動引導使用者安裝 CLI；移除內嵌二進位（TD-16）", "收到權利人通知"),
        ("R5", "簽章與 SmartScreen 信任", "營運", "高", "中", "及早購買 EV 憑證；提供 SHA256 與獨立驗證說明", "首次啟動放棄率 > 50%"),
        ("R6", "單人依賴（bus factor = 1）", "組織", "高", "高", "文件化、配對開發、把關鍵模組寫成可交接的規格", "核心開發者連續兩週無法投入"),
        ("R7", "免費轉付費低於 2%", "商業", "中", "高", "收緊免費額度；把模型記憶與通知納入付費；強化首次啟動引導", "三個月轉換率 < 1.8%"),
        ("R8", "企業資安因權限過寬否決", "商業", "高", "中", "TD-14：預設改為逐次確認，提供白名單專案模式", "企業試點卡在資安審查"),
        ("R9", "macOS 競品推出 Windows 版", "競爭", "中", "中", "以「原對話」與價格差異化；避免功能對撞", "競品發布 Windows 預覽"),
        ("R10", "商標衝突", "法務", "低", "中", "註冊前做完整檢索；準備備用名稱", "檢索出現同類註冊"),
        ("R11", "定價與匯率", "財務", "低", "低", "以美元定價、區域定價分層；每年檢視一次", "新台幣劇烈波動"),
        ("R12", "寵物功能被視為不專業", "產品", "中", "低", "預設關閉、可完全移除；定位為「狀態顯示器」而非玩具", "企業試點問卷負評 > 20%"),
    ]
    table(doc, ["編號", "風險", "類型", "機率", "影響", "緩解", "觸發指標"], rows,
          [1.1, 4.4, 1.2, 1.1, 1.1, 4.6, 3.0], size=7.6, header_size=7.8,
          align=["center", "left", "center", "center", "center", "left", "left"])

    para(doc, "這張表裡真正需要董事會層級關注的只有三項：R1（產品承諾是否成立）、R2（格式依賴是否致命）、R6（組織是否可交接）。"
              "其餘九項都是可管理的營運風險——它們會消耗時間，但不會讓計劃失效。")

    spacer(doc, 4)
    callout(doc, "本章結論",
            "這個計劃的最大風險不是市場太小，而是「太小又太依賴單一平台」。緩解方式只有一個："
            "在 12 個月內把整合對象從兩個增加到三個，讓任何一個平台都無法單獨決定產品的生死。",
            fill=SAND, bar="B06C1E")


# ------------------------------------------------------------------ chapter 11
def chapter11(doc):
    h1(doc, "11", "法務與合規", "LEGAL")
    lead(doc, "四個需要在上線前處理的問題：授權、CLI 條款、內嵌二進位、商標。")

    h2(doc, "11.1", "MIT 授權與商業化")
    para(doc, "專案採用 MIT 授權（Copyright (c) 2026 agent-board contributors）。MIT 允許任何人使用、修改、再散布，"
              "甚至允許衍生作品以閉源方式發佈——這意味著「開源核心 + 閉源商業版」在法律上是可行的，"
              "但必須保留原始版權聲明與授權條文。實務上有兩個要注意的地方：")
    bullet(doc, "商標不在授權範圍內。MIT 只授予程式碼權利，不授予「MaxAgent」名稱或標誌的使用權。若要防止他人用同名散布，必須另外註冊商標。", bold_head="")
    bullet(doc, "貢獻者條款。目前沒有 CLA（貢獻者授權協議），若未來要接受外部貢獻並商業化，建議補上 DCO 或 CLA，避免權利碎片化。")

    h2(doc, "11.2", "與 Claude Code／Codex 的條款關係")
    para(doc, "MaxAgent 不轉售模型存取、不代理請求、不共享帳號。它只是在使用者自己的機器上，呼叫使用者自己已登入的 CLI。"
              "這個結構讓它远离「未經授權的 API 轉售」問題，但仍需注意兩點：一是不會在介面上誤導使用者「MaxAgent 提供模型」；"
              "二是企業方案若涉及集中管理多個使用者的憑證，就會跨入不同的合規領域，需要重新評估。")

    h2(doc, "11.3", "內嵌 346 MB 的 claude.exe：最需要處理的一項")
    para(doc, "專案在 runtime/claude/claude.exe 內嵌了一份 346,487,456 bytes 的 Claude Code 執行檔（版本 2.1.321、"
              "Anthropic PBC 簽章）。這件事在技術上很方便（使用者不必自行安裝），在法律上是目前最不確定的部分："
              "再散布第三方二進位檔通常需要原始授權明確允許，而 Anthropic 的條款是否涵蓋「隨桌面應用附帶 CLI」，需要逐字確認。")
    rows = [
        ("短期（上線前）", "移除以引導安裝取代內嵌", "消除再散布風險；安裝多一步", "P1"),
        ("中期", "取得書面確認或改用官方安裝器", "可保留一鍵體驗", "P2"),
        ("長期", "改為偵測既有安裝 + 官方管道下載", "與上游更新同步", "P2"),
    ]
    table(doc, ["階段", "做法", "影響", "優先級"], rows, [3.2, 6.4, 4.6, 1.8], size=8.6,
          align=["left", "left", "left", "center"], first_col_bold=True)
    para(doc, "附帶的好處是：移除內嵌二進位會讓安裝檔從數百 MB 降到數十 MB，這對下載轉換率的幫助可能比任何行銷手段都大。")

    h2(doc, "11.4", "隱私與資料處理")
    para(doc, "產品的資料流只有一個方向：從使用者本機的對話檔案，讀進使用者本機的記憶體，顯示在使用者本機的視窗。"
              "沒有伺服器端儲存、沒有帳號系統、沒有行為分析。這讓它在 GDPR／個資法的角度相對簡單，但仍需做到三件事："
              "明確的隱私政策（說明讀取哪些路徑、不做什麼）、可完全關閉的診斷回報、以及解除安裝時可選擇清除本機狀態檔。")

    h2(doc, "11.5", "商標與名稱")
    para(doc, "「MaxAgent」是一個通用性偏高的名稱，且在 AI 領域已有其他產品使用類似字樣。建議在正式商業化前完成："
              "美國與台灣的商標檢索、Class 9（軟體）與 Class 42（SaaS）的註冊評估、以及至少一個備用名稱。"
              "另外，程式碼中的 agent-board 字樣屬於前身專案，若品牌獨立，應一併清理，避免使用者混淆。")

    spacer(doc, 4)
    callout(doc, "本章結論",
            "四項之中，只有「內嵌 claude.exe」是必須在上線前解決的硬問題，其餘三項都是可以並行處理的行政工作。"
            "把這件事處理掉，還順帶解決了安裝檔過大的體驗問題——這是少見的「合規與成長同向」的情況。")


# ------------------------------------------------------------------ chapter 12
def chapter12(doc):
    h1(doc, "12", "結論與募資訴求", "CONCLUSION")
    lead(doc, "三句話，然後是一個具體的請求。")

    h2(doc, "12.1", "三句話")
    numbered(doc, 1, "這是一個已經被技術驗證、但還沒被商業驗證的產品。",
             "原對話續派在兩個 Harness 上都跑通過了，23 項測試全綠；但它還沒有安裝檔、沒有付費、也沒有關掉 P0。")
    numbered(doc, 2, "它的價值與風險來自同一個地方：對底層格式的掌握。",
             "掌握得越深，替代難度越高；但上游一改格式，它就跟著震。這決定了它必須小而快，不能大而慢。")
    numbered(doc, 3, "它是一門可以自給自足的生意，不是一個要衝十億美元的題目。",
             "第三年約 112 萬美元 ARR、40 萬美元內走到現金流轉正。適合策略天使與微型基金，不適合追求超額回報的機構輪。")

    h2(doc, "12.2", "資金與里程碑的對應")
    rows = [
        ("US$120k", "Q1：關閉 P0、Git／CI、打包簽章", "陌生使用者可自行安裝並完成一次續派"),
        ("US$90k", "Q2：授權付費、英文介面、自動更新", "首 100 名付費"),
        ("US$100k", "Q3：第三個 Harness、權限收斂、任務佇列", "500 名付費，Team 席位 ≥ 40"),
        ("US$90k", "Q4：手機配對雛形、效能與穩定性", "1,000 名付費，週留存 35%"),
    ]
    table(doc, ["資金", "用途", "驗收標準"], rows, [3.0, 8.0, 5.4], size=9,
          align=["center", "left", "left"], first_col_bold=True)

    h2(doc, "12.3", "為什麼是現在")
    para(doc, "三個時間窗口正在同時打開：Windows 在跨 Agent 工具上仍是空白；官方剛把 Agent 搬上桌面，本機檔案因此成為穩定介面；"
              "而企業對「上傳程式碼到第三方」的容忍度正在下降。這三個窗口不會同時開很久——"
              "一旦某個 macOS 工具推出 Windows 版，或某個官方應用加入跨工具歷史，第一個窗口就會關閉。")

    h2(doc, "12.4", "我們要什麼")
    callout(doc, "募資訴求",
            "US$400,000 種子資金，對應 18 個月、四個季度、四個可驗收的里程碑。"
            "資金之外，我們更需要兩件事：一個願意在企業內部試點的使用者，以及一條與 Harness 廠商對話的管道。",
            fill=SAND, bar="B06C1E")

    para(doc, "如果把這份計劃書壓成一句話：這是一個把「多 Agent 時代的對話」當成資產來管理的工具，"
              "它已經證明技術上做得到，接下來要證明的是——有人願意為它每個月付 9 美元。")

    spacer(doc, 14)
    hairline(doc, BORDER, 4, 6, 6)
    para(doc, "MaxAgent 專案團隊（agent-board contributors）", size=9, color=SLATE, align="left", after=0)
    para(doc, "文件版本 v1.0　·　2026 年 11 月　·　內部與投資人傳閱", size=8.5, color=MUTED, align="left")


# ------------------------------------------------------------------ appendix
def appendix(doc):
    h1(doc, None, "附錄", "APPENDIX")

    h2(doc, "A", "技術棧版本清單")
    rows = [
        ("Electron", "45.2.3", "devDependency；執行容器"),
        ("marked", "18.2.0", "唯一執行期依賴；Markdown 渲染"),
        ("Codex CLI／app-server", "0.167", "JSON-RPC 2.0 over stdio"),
        ("Claude Code CLI", "2.1.321", "--resume、stream-json"),
        ("Node.js（Electron 內建）", "對應 Electron 45", "node:test、node:sqlite"),
        ("Python（本文件產製）", "3.x", "python-docx 1.2.0、Pillow"),
    ]
    table(doc, ["元件", "版本", "用途"], rows, [5.4, 3.6, 7.4], size=8.8, first_col_bold=True)

    h2(doc, "B", "已驗證的技術證據")
    rows = [
        ("Codex 原對話續派", "以 app-server 對 thread 01a1c113-e992-7090-9718-3d42fef14fb5 續派", "收到同輪 turn/completed，狀態 completed"),
        ("Claude 原對話續派", "claude --resume e7323699-c804-4dd7-a928-dc8a15dccaef", "exit 0，輸出可解析"),
        ("歷史讀取（Codex）", "掃描 ~/.codex/sessions/rollout-*.jsonl", "38 個 session 可列"),
        ("歷史讀取（Claude）", "掃描 ~/.claude/projects/*.jsonl", "11 個 session 級別，正確排除 subagents"),
        ("模型目錄", "Codex model/list（limit 100、cursor 分頁）", "9 個模型；首個模型 6 種推理強度"),
        ("自動測試", "node --test desktop/*.test.js", "12 個測試檔、23 項全通過"),
        ("語法檢查", "node --check（6 個檔案）", "全通過"),
        ("暖刷新效能", "mtime+size 快取", "567／673／571 ms → 16／17／15 ms"),
    ]
    table(doc, ["項目", "方法", "結果"], rows, [4.0, 7.0, 5.4], size=8.4, first_col_bold=True)

    h2(doc, "C", "名詞表")
    rows = [
        ("Harness", "承載 Agent 的執行外殼，例如 Codex、Claude Code、DSH。", "本文件的核心概念"),
        ("Thread／Session", "一次連續對話的識別單位；續派的對象。", "MaxAgent 以它為工作單位"),
        ("app-server", "Codex 提供的 JSON-RPC 服務，可列出模型與續跑 thread。", "P0 的爭奪對象"),
        ("rollout JSONL", "Codex 在 ~/.codex/sessions/ 下的對話紀錄格式。", "主要資料來源"),
        ("turn", "一輪「使用者指令 → Agent 執行 → 完成事件」。", "續派與核對的粒度"),
        ("ARR", "年度化經常性收入，等於年末付費用戶 × 年 ARPU。", "與「營收」不同，見 8.1"),
        ("LTV／CAC", "客戶終身價值與獲客成本之比。", "本計劃為 5.3 倍"),
    ]
    table(doc, ["名詞", "說明", "在本文件中的角色"], rows, [3.4, 8.6, 4.4], size=8.6, first_col_bold=True)

    h2(doc, "D", "資料來源")
    srcs = [
        "SlashData，《Developer Population》— 全球開發者人口估計（2,700 萬至 4,700 萬區間）。"
        "https://developers.slashdata.co/research/developer-population",
        "JetBrains 2025 開發者生態調查，經 Infoworld 報導：85% 開發者定期使用 AI 工具。"
        "https://www.infoworld.com/article/4077352/85-of-developers-use-ai-regularly-jetbrains-survey.html",
        "CB Insights，《Who's winning the AI coding race?》（2025-12）— AI 編碼工具市占與競爭格局。"
        "https://www.cbinsights.com/research/report/coding-ai-market-share-december-2025/",
        "MaxAgent 專案內部文件：docs/01-PRD.md、docs/02-實作計劃.md、docs/03-技術債與Bug.md、docs/04-實作記錄與進度.md。",
        "MaxAgent 原始碼盤點：desktop/ 目錄 16 個生產 JS 檔（447 行）、12 個測試檔、server.js（379 行）。",
    ]
    for i, s in enumerate(srcs, 1):
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.left_indent = Cm(0.9)
        pf.first_line_indent = Cm(-0.9)
        spacing(p, 0, 4, 1.5)
        r = p.add_run(f"[{i}]　")
        set_font(r, 8.6, True, TEAL)
        r = p.add_run(s)
        set_font(r, 8.6, False, SLATE)

    spacer(doc, 10)
    para(doc, "本文件由專案團隊自行撰寫，財務數字為自建試算模型，未經會計師查核；技術數據為單機實測，"
              "會隨硬體與資料量而異。引用之第三方數據僅供市場規模參考，不代表對本產品未來表現的保證。",
         size=8, color=MUTED, line=1.5)


# ------------------------------------------------------------------ main
def build():
    doc = new_doc()
    cover(doc)
    toc(doc)
    summary(doc)
    chapter1(doc)
    chapter2(doc)
    chapter3(doc)
    chapter4(doc)
    chapter5(doc)
    chapter6(doc)
    chapter7(doc)
    chapter8(doc)
    chapter9(doc)
    chapter10(doc)
    chapter11(doc)
    chapter12(doc)
    appendix(doc)
    doc.core_properties.title = "MaxAgent 商業計劃書"
    doc.core_properties.subject = "跨 Agent Harness 的 Windows 本地工作台"
    doc.core_properties.author = "MaxAgent 專案團隊"
    doc.core_properties.comments = "v1.0 / 2026-11"
    doc.save(OUT)
    print("saved:", OUT)


if __name__ == "__main__":
    build()





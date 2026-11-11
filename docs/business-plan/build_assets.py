# -*- coding: utf-8 -*-
"""Generate diagrams/charts for the MaxAgent business plan (Pillow only)."""
import os
import math
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "assets")
os.makedirs(ASSETS, exist_ok=True)

NAVY = (14, 42, 61)
INK = (23, 42, 58)
TEAL = (17, 107, 120)
SLATE = (81, 101, 117)
BORDER = (215, 225, 234)
LIGHT = (243, 246, 250)
WHITE = (255, 255, 255)
AMBER = (176, 108, 30)
RED = (150, 52, 45)

FONT_PATH = r"C:\Windows\Fonts\msjh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msjhbd.ttc"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_PATH, size)


def text(draw, xy, s, size=26, color=INK, bold=False, anchor="la"):
    draw.text(xy, s, font=font(size, bold), fill=color, anchor=anchor)


def wrap(s, f, max_w):
    lines, cur = [], ""
    for ch in s:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        trial = cur + ch
        if f.getlength(trial) > max_w and cur:
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def fit_size(s, size, max_w, bold=False, floor=14):
    while size > floor and font(size, bold).getlength(s) > max_w:
        size -= 1
    return size


def box(draw, xy, fill=WHITE, outline=BORDER, radius=18, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def arrow(draw, p1, p2, color=TEAL, width=4, head=14, label=None, lsize=20, loff=(0, 0)):
    draw.line([p1, p2], fill=color, width=width)
    ang = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    for s in (2.6, -2.6):
        q = (p2[0] + head * math.cos(ang + s), p2[1] + head * math.sin(ang + s))
        draw.line([p2, q], fill=color, width=width)
    if label:
        f = font(lsize)
        mx, my = (p1[0] + p2[0]) / 2 + loff[0], (p1[1] + p2[1]) / 2 + loff[1]
        w = f.getlength(label)
        draw.rectangle([mx - w / 2 - 8, my - 17, mx + w / 2 + 8, my + 17], fill=(250, 251, 252))
        draw.text((mx, my), label, font=f, fill=SLATE, anchor="mm")


# ---------------------------------------------------------------- architecture
def architecture():
    W, H = 1900, 1120
    img = Image.new("RGB", (W, H), (250, 251, 252))
    d = ImageDraw.Draw(img)

    text(d, (60, 44), "MaxAgent 系統架構", 42, NAVY, True)
    text(d, (62, 102), "本地優先：不中介、不複製對話、不托管憑證；所有派工回到原工具的原對話 ID",
         24, SLATE)

    text(d, (68, 168), "原工具層 / Harness", 26, TEAL, True)
    text(d, (676, 168), "MaxAgent 桌面程式（Electron 45）", 26, TEAL, True)
    text(d, (1462, 168), "本機資料", 26, TEAL, True)

    # ---- left column
    left = [
        ("Codex 桌面版", "內建 codex.exe\napp-server（stdio JSON-RPC）", 208, 196),
        ("Claude Code CLI", "2.1.321 ｜ --resume 原 ID\nstream-json 輸出", 470, 196),
        ("DSH / OpenCode / WorkBuddy", "後續接入；目前僅舊看板可讀\n（MAX-012）", 732, 196),
    ]
    for title, sub, y, h in left:
        box(d, (68, y, 596, y + h))
        ts = fit_size(title, 28, 596 - 68 - 56, True)
        text(d, (96, y + 26), title, ts, INK, True)
        yy = y + 82
        for line in sub.split("\n"):
            text(d, (96, yy), line, 22, SLATE)
            yy += 38

    # ---- middle column
    box(d, (664, 198, 1414, 1044), WHITE, (176, 196, 210), radius=26, width=3)
    text(d, (692, 220), "主程序  main.js", 29, NAVY, True)
    box(d, (690, 264, 1388, 470), LIGHT, BORDER, radius=14)
    lines = [
        "harness.js ｜ 掃描 JSONL、解析歷史、spawn 派工",
        "model-settings.js ｜ 模型目錄與逐聊天室選擇校驗",
        "result-evidence.js ｜ 回到原紀錄核對本輪結果",
        "jobs / sessions ｜ 15 秒刷新、20 分鐘硬逾時",
    ]
    yy = 286
    for ln in lines:
        text(d, (714, yy), "• " + ln, 21, INK)
        yy += 40

    text(d, (692, 492), "IPC 邊界（contextBridge + allowlist）", 26, NAVY, True)
    box(d, (690, 530, 1388, 618), (232, 241, 245), BORDER, radius=12)
    text(d, (714, 562), "agent:list / history / read / send / getChatModel …", 21, INK)

    text(d, (692, 646), "渲染程序（sandbox: true、nodeIntegration: false）", 26, NAVY, True)
    cards = [
        (690, 894, "主視窗", ["卡片總覽", "對話 + 派工", "設定 / 主題"]),
        (912, 1058, "寵物", ["獨立視窗", "preload", "330×440"]),
        (1076, 1240, "通知", ["Windows", "toast", "點擊回跳"]),
        (1258, 1388, "證據", ["原紀錄", "輪次比對", "結果回填"]),
    ]
    for x1, x2, t, rows in cards:
        box(d, (x1, 684, x2, 852), LIGHT, BORDER, radius=14)
        text(d, (x1 + 18, 702), t, 23, INK, True)
        yy = 744
        for r in rows:
            text(d, (x1 + 18, yy), r, 19, SLATE)
            yy += 34

    box(d, (690, 884, 1388, 1008), (243, 238, 226), (214, 198, 170), radius=14)
    text(d, (714, 902), "CSP: default-src 'none'；禁 will-navigate、攔 window.open", 21, (120, 88, 40), True)
    text(d, (714, 940), "狀態檔 tmp+rename 原子寫入；舊看板 127.0.0.1:7760 只綁本機", 21, (120, 88, 40))

    # ---- right column
    right = [
        ("~/.codex/sessions/", ["rollout-*.jsonl", "session_index.jsonl", "標題、輪次、完成事件"], 208, 176),
        ("~/.claude/projects/", ["*.jsonl（含 cwd、uuid）", "排除 subagents"], 420, 148),
        ("userData/", ["maxagent-state.json", "已讀、主題、通知、", "逐聊天室模型（原子寫入）"], 604, 176),
        ("~/.cc-switch/cc-switch.db", ["node:sqlite 唯讀", "確認目前供應商"], 816, 130),
    ]
    for title, rows, y, h in right:
        box(d, (1460, y, 1832, y + h))
        ts = fit_size(title, 22, 1832 - 1460 - 52, True, 16)
        text(d, (1482, y + 20), title, ts, INK, True)
        yy = y + 62
        for r in rows:
            text(d, (1482, yy), r, 20, SLATE)
            yy += 32

    arrow(d, (598, 300), (662, 300), TEAL, 4, 12, "讀歷史", 19, (0, -24))
    arrow(d, (662, 372), (598, 372), AMBER, 4, 12, "派工", 19, (0, 24))
    arrow(d, (598, 560), (662, 560), TEAL, 4, 12, "讀歷史", 19, (0, -24))
    arrow(d, (662, 632), (598, 632), AMBER, 4, 12, "派工", 19, (0, 24))
    arrow(d, (1416, 300), (1458, 300), SLATE, 3, 10)
    arrow(d, (1416, 500), (1458, 500), SLATE, 3, 10)
    arrow(d, (1458, 660), (1416, 660), SLATE, 3, 10)

    text(d, (68, 1040), "青綠＝讀取路徑；琥珀＝寫入路徑（Codex 寫入目前遭原桌面程序鎖定，列為 P0）；灰＝狀態讀寫",
         21, SLATE)
    img.save(os.path.join(ASSETS, "architecture.png"))


# ---------------------------------------------------------------- financials
def financials():
    W, H = 1700, 940
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    text(d, (90, 52), "三年財務預測（基準案，千美元）", 38, NAVY, True)
    text(d, (90, 108), "營收隨付費用戶成長；Y3 現金流接近打平，Y4 上半年轉正", 23, SLATE)

    years = ["Y1 2027", "Y2 2028", "Y3 2029"]
    rev = [34, 167, 538]
    cost = [112, 326, 600]
    arr = [50, 299, 1125]

    left, right, top, bottom = 190, 1560, 250, 700
    maxv = 650

    def y(v):
        return bottom - (v / maxv) * (bottom - top)

    for g in range(0, 701, 100):
        yy = y(g)
        d.line([(left, yy), (right, yy)], fill=(236, 241, 245), width=1)
        text(d, (left - 18, yy), f"{g}", 20, (130, 145, 156), anchor="rm")

    bw = 104
    for i, (yr, r, c) in enumerate(zip(years, rev, cost)):
        cx = left + 130 + i * 460
        d.rounded_rectangle([cx, y(r), cx + bw, bottom], radius=5,
                            fill=[(15, 96, 108), (24, 126, 139), (45, 154, 167)][i])
        d.rounded_rectangle([cx + bw + 20, y(c), cx + 2 * bw + 20, bottom], radius=5,
                            fill=(208, 216, 223))
        text(d, (cx + bw / 2, y(r) - 16), f"{r}", 23, NAVY, True, anchor="mb")
        text(d, (cx + bw + 20 + bw / 2, y(c) - 16), f"{c}", 23, (110, 124, 134), True, anchor="mb")
        text(d, (cx + bw + 12, bottom + 22), yr, 22, INK, True, anchor="ma")

    d.line([(left, bottom), (right, bottom)], fill=(150, 166, 178), width=2)

    # ARR strip (separate scale, clearly labelled)
    sy = 790
    d.rounded_rectangle([left, sy, right, sy + 92], radius=10, fill=(247, 243, 234), outline=(226, 214, 190))
    text(d, (left + 22, sy + 14), "年末 ARR", 20, (140, 100, 40), True)
    for i, a in enumerate(arr):
        cx = left + 130 + i * 460 + bw + 12
        text(d, (cx, sy + 44), f"{a:,}", 27, AMBER, True, anchor="ma")

    # legend
    lx, ly = 1040, 60
    d.rounded_rectangle([lx, ly + 2, lx + 24, ly + 26], radius=3, fill=TEAL)
    text(d, (lx + 36, ly + 2), "營收", 21, INK)
    d.rounded_rectangle([lx + 106, ly + 2, lx + 130, ly + 26], radius=3, fill=(208, 216, 223))
    text(d, (lx + 142, ly + 2), "營業成本與費用", 21, INK)

    img.save(os.path.join(ASSETS, "financials.png"))


# ---------------------------------------------------------------- debt matrix
def debt_matrix():
    W, H = 1700, 1000
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    text(d, (80, 44), "技術債優先矩陣", 38, NAVY, True)
    text(d, (80, 100), "橫軸＝修復成本（人日）；縱軸＝不修的商業代價。編號對應第 7 章清單", 22, SLATE)

    left, right, top, bottom = 210, 1550, 200, 860
    d.rectangle([left, top, right, bottom], fill=(251, 252, 253), outline=(228, 234, 240))
    d.line([((left + right) / 2, top), ((left + right) / 2, bottom)], fill=(228, 234, 240), width=2)
    d.line([(left, (top + bottom) / 2), (right, (top + bottom) / 2)], fill=(228, 234, 240), width=2)

    text(d, (left + 18, top + 10), "立即做：高代價 / 低成本", 20, RED, True)
    text(d, (right - 18, top + 10), "計劃做：高代價 / 高成本", 20, AMBER, True, anchor="ra")
    text(d, (left + 18, bottom - 32), "順手做：低代價 / 低成本", 20, SLATE, True)
    text(d, (right - 18, bottom - 32), "接受或外包：低代價 / 高成本", 20, SLATE, True, anchor="ra")

    # nx, ny, label, colour, radius, label side ("r"/"l")
    items = [
        (0.10, 0.80, "TD-01 Codex 寫入鎖", RED, 9, "r"),
        (0.26, 0.92, "TD-02 結果核對脆弱", RED, 8, "r"),
        (0.17, 0.70, "TD-03 無打包簽章", AMBER, 9, "r"),
        (0.06, 0.52, "TD-04 無版本控制", RED, 7, "r"),
        (0.36, 0.60, "TD-05 程式碼密度", AMBER, 8, "r"),
        (0.29, 0.36, "TD-06 無 CI / lint", AMBER, 7, "r"),
        (0.19, 0.58, "TD-07 無型別", AMBER, 7, "r"),
        (0.40, 0.47, "TD-08 解析器重複", AMBER, 7, "r"),
        (0.50, 0.78, "TD-09 私有格式依賴", RED, 9, "r"),
        (0.58, 0.38, "TD-10 cc-switch schema", AMBER, 7, "r"),
        (0.68, 0.56, "TD-11 同步掃描阻塞", AMBER, 8, "r"),
        (0.43, 0.24, "TD-12 狀態檔無遷移", SLATE, 6, "r"),
        (0.76, 0.28, "TD-13 無 i18n", SLATE, 7, "r"),
        (0.56, 0.66, "TD-14 權限模型過寬", RED, 8, "r"),
        (0.64, 0.72, "TD-15 無逐對話金鑰", AMBER, 8, "r"),
        (0.80, 0.90, "TD-16 內嵌 346MB", AMBER, 8, "l"),
        (0.88, 0.62, "TD-17 無遙測", SLATE, 7, "l"),
        (0.82, 0.48, "TD-18 無授權 / 付費", SLATE, 8, "l"),
        (0.72, 0.14, "TD-19 無取消 / 佇列", SLATE, 7, "r"),
        (0.60, 0.08, "TD-20 證據快取不持久", SLATE, 6, "l"),
    ]
    for nx, ny, label, color, size, side in items:
        x = left + nx * (right - left)
        y = bottom - ny * (bottom - top)
        d.ellipse([x - size, y - size, x + size, y + size], fill=color)
        f = font(19)
        if side == "r":
            d.text((x + size + 10, y), label, font=f, fill=INK, anchor="lm")
        else:
            d.text((x - size - 10, y), label, font=f, fill=INK, anchor="rm")

    text(d, (left, 890), "紅＝P0／P1 且阻斷交付；琥珀＝規模化前必須處理；灰＝可排程", 20, SLATE)
    img.save(os.path.join(ASSETS, "debt-matrix.png"))


if __name__ == "__main__":
    architecture()
    financials()
    debt_matrix()
    print("assets written to", ASSETS)

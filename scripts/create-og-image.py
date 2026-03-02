#!/usr/bin/env python3
"""
ABOUTME: Generate the Pull Read Open Graph card image (1200x630)
ABOUTME: Uses current brand palette, fonts, and document-with-bookmark icon
"""

from PIL import Image, ImageDraw, ImageFont
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(SCRIPT_DIR, "fonts")

W, H = 1200, 630

# Brand colors from shared.css
PAPER = (250, 248, 244)       # --paper: #faf8f4
PAPER_WARM = (243, 239, 232)  # --paper-warm: #f3efe8
INK = (28, 25, 23)            # --ink: #1c1917
INK_SECONDARY = (87, 83, 78)  # --ink-secondary: #57534e
INK_MUTED = (115, 109, 103)   # --ink-muted: #736d67
ACCENT = (180, 85, 53)        # --accent: #b45535
ACCENT_BG = (254, 242, 238)   # --accent-bg: #fef2ee
BORDER = (231, 225, 216)      # --border: #e7e1d8
WHITE = (255, 255, 255)


def draw_brand_icon(draw, cx, cy, size):
    """Draw the document-with-bookmark brand icon."""
    # Icon background box (rounded square)
    box_r = size // 6
    draw.rounded_rectangle(
        [cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2],
        radius=box_r,
        fill=ACCENT,
    )

    # Document inside (white)
    doc_w = size * 0.45
    doc_h = size * 0.58
    doc_l = cx - doc_w / 2 - size * 0.04
    doc_t = cy - doc_h / 2 + size * 0.02
    doc_r = doc_l + doc_w
    doc_b = doc_t + doc_h
    doc_radius = size // 16

    draw.rounded_rectangle(
        [doc_l, doc_t, doc_r, doc_b],
        radius=doc_radius,
        fill=WHITE,
    )

    # Text lines (3 decreasing width lines)
    line_h = max(2, size // 30)
    line_gap = size * 0.075
    line_start_y = doc_t + doc_h * 0.35
    line_left = doc_l + doc_w * 0.15
    widths = [0.65, 0.55, 0.45]

    for i, w_frac in enumerate(widths):
        y = line_start_y + i * line_gap
        lw = doc_w * w_frac
        draw.rounded_rectangle(
            [line_left, y, line_left + lw, y + line_h],
            radius=line_h // 2,
            fill=ACCENT,
        )

    # Bookmark ribbon (top-right of document, protruding up)
    bk_w = size * 0.10
    bk_h = size * 0.22
    bk_left = doc_r - doc_w * 0.28
    bk_top = doc_t - size * 0.02
    bk_bottom = bk_top + bk_h
    bk_right = bk_left + bk_w
    notch = size * 0.03

    ribbon_pts = [
        (bk_left, bk_top),
        (bk_right, bk_top),
        (bk_right, bk_bottom),
        ((bk_left + bk_right) / 2, bk_bottom - notch),
        (bk_left, bk_bottom),
    ]
    draw.polygon(ribbon_pts, fill=WHITE)


def draw_mini_app_mock(draw, x, y, w, h):
    """Draw a simplified app window mock on the right side."""
    radius = 14

    # Window chrome
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=WHITE)
    draw.rounded_rectangle(
        [x, y, x + w, y + h], radius=radius, outline=BORDER, width=1
    )

    # Title bar dots
    dot_y = y + 16
    for i, color in enumerate([(236, 95, 93), (232, 191, 77), (97, 196, 110)]):
        draw.ellipse(
            [x + 14 + i * 18, dot_y - 4, x + 14 + i * 18 + 8, dot_y + 4],
            fill=color,
        )

    # Sidebar area
    sidebar_w = int(w * 0.25)
    sidebar_right = x + sidebar_w
    draw.rectangle([x + 1, y + 30, sidebar_right, y + h - 1], fill=PAPER)
    draw.line(
        [(sidebar_right, y + 30), (sidebar_right, y + h)], fill=BORDER, width=1
    )

    # Sidebar items
    for i in range(4):
        iy = y + 48 + i * 28
        bar_w = sidebar_w * (0.7 - i * 0.08)
        draw.rounded_rectangle(
            [x + 14, iy, x + 14 + bar_w, iy + 10],
            radius=5,
            fill=BORDER,
        )

    # Content area - title bar
    cx = sidebar_right + 20
    cy = y + 50
    draw.rounded_rectangle(
        [cx, cy, cx + w * 0.55, cy + 16], radius=8, fill=INK + (40,)
    )

    # Summary tab indicator
    tab_y = cy + 34
    draw.rounded_rectangle(
        [cx, tab_y, cx + 55, tab_y + 18], radius=4, fill=ACCENT_BG
    )
    draw.rounded_rectangle(
        [cx + 60, tab_y, cx + 130, tab_y + 18], radius=4, fill=PAPER_WARM
    )

    # Content lines
    content_y = tab_y + 36
    for i in range(6):
        ly = content_y + i * 22
        lw = w * 0.6 - (10 if i == 5 else 0) - (i % 3) * 15
        color = (235, 220, 90, 255) if i == 3 else (*INK_MUTED, 60)
        draw.rounded_rectangle(
            [cx, ly, cx + lw, ly + 8], radius=4, fill=color
        )


def create_og_image(output_path):
    img = Image.new("RGBA", (W, H), PAPER)
    draw = ImageDraw.Draw(img)

    # Subtle warm gradient at bottom
    for i in range(120):
        alpha = min(25, i // 5)
        y = H - 120 + i
        draw.rectangle([0, y, W, y + 1], fill=(*ACCENT, alpha))

    # Bottom accent bar
    draw.rectangle([0, H - 4, W, H], fill=ACCENT)

    # Load fonts
    font_display_lg = ImageFont.truetype(
        os.path.join(FONT_DIR, "InstrumentSerif-Regular.ttf"), 72
    )
    font_display_it = ImageFont.truetype(
        os.path.join(FONT_DIR, "InstrumentSerif-Italic.ttf"), 30
    )
    font_body = ImageFont.truetype(
        os.path.join(FONT_DIR, "WorkSans-Regular.ttf"), 22
    )
    font_body_sm = ImageFont.truetype(
        os.path.join(FONT_DIR, "WorkSans-Light.ttf"), 18
    )

    # Left column: Brand icon + text
    left_x = 80
    icon_y = 190

    # Brand icon
    draw_brand_icon(draw, left_x + 36, icon_y, 72)

    # App name
    name_y = icon_y + 50
    draw.text((left_x, name_y), "Pull Read", fill=INK, font=font_display_lg)

    # Tagline
    tagline_y = name_y + 78
    draw.text(
        (left_x, tagline_y),
        "Own what you learn.",
        fill=INK_SECONDARY,
        font=font_display_it,
    )

    # Description
    desc_y = tagline_y + 50
    lines = [
        "Summarize, highlight, listen, and think",
        "\u2014 all yours, all local.",
        "Saved as clean Markdown files.",
    ]
    for i, line in enumerate(lines):
        draw.text(
            (left_x, desc_y + i * 30),
            line,
            fill=INK_MUTED,
            font=font_body,
        )

    # URL
    draw.text(
        (left_x, H - 50), "pullread.com", fill=INK_MUTED, font=font_body_sm
    )

    # Right column: Mini app mock
    mock_w = 440
    mock_h = 340
    mock_x = W - mock_w - 80
    mock_y = (H - mock_h) // 2 - 10
    draw_mini_app_mock(draw, mock_x, mock_y, mock_w, mock_h)

    # Save as RGB (no alpha for social cards)
    rgb = Image.new("RGB", (W, H), PAPER)
    rgb.paste(img, mask=img.split()[3])
    rgb.save(output_path, "PNG", optimize=True)
    print(f"Created: {output_path} ({W}x{H})")


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        SCRIPT_DIR, "..", "site", "og-image.png"
    )
    create_og_image(output)

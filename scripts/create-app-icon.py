#!/usr/bin/env python3
"""
ABOUTME: Generate the Pull Read app icon programmatically
ABOUTME: Creates a 1024x1024 PNG matching the app's visual identity

Produces a teal rounded-square background with a white document page,
three dark text lines, and an orange bookmark ribbon.
"""

from PIL import Image, ImageDraw, ImageFilter
import math
import sys
import os

SIZE = 1024


def rounded_rect_mask(size, radius):
    """Create a rounded rectangle mask."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_shadow(draw, bbox, radius, color, blur_passes=3):
    """Draw a soft shadow by layering translucent rounded rects."""
    for i in range(blur_passes, 0, -1):
        offset = i * 3
        shadow_bbox = [
            bbox[0] + offset // 2,
            bbox[1] + offset,
            bbox[2] + offset // 2,
            bbox[3] + offset,
        ]
        alpha = max(10, 40 - i * 10)
        shadow_color = (*color[:3], alpha) if len(color) == 4 else (*color, alpha)
        draw.rounded_rectangle(shadow_bbox, radius=radius, fill=shadow_color)


def create_icon(output_path):
    # Create base image with transparency
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # --- Background: teal rounded square ---
    bg_margin = 12
    bg_radius = int(SIZE * 0.22)  # ~225px radius for macOS-style superellipse

    # Gradient-like teal background (darker edges, lighter center)
    # Base teal color
    teal_dark = (0, 140, 130)
    teal_mid = (20, 170, 155)
    teal_light = (50, 190, 175)

    # Draw the main background
    draw.rounded_rectangle(
        [bg_margin, bg_margin, SIZE - bg_margin, SIZE - bg_margin],
        radius=bg_radius,
        fill=teal_mid,
    )

    # Add subtle gradient overlay (lighter top-left)
    gradient = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(gradient)

    # Top highlight
    for i in range(200):
        alpha = max(0, 30 - i // 7)
        y = bg_margin + i
        gdraw.rectangle(
            [bg_margin, y, SIZE - bg_margin, y + 1], fill=(255, 255, 255, alpha)
        )

    # Bottom shadow
    for i in range(150):
        alpha = max(0, 20 - i // 8)
        y = SIZE - bg_margin - i
        gdraw.rectangle(
            [bg_margin, y, SIZE - bg_margin, y + 1], fill=(0, 0, 0, alpha)
        )

    # Apply gradient with mask
    mask = rounded_rect_mask(SIZE, bg_radius)
    img = Image.composite(
        Image.alpha_composite(img, gradient), img, mask
    )
    draw = ImageDraw.Draw(img)

    # --- Document page (white card with slight shadow) ---
    page_left = int(SIZE * 0.20)
    page_top = int(SIZE * 0.14)
    page_right = int(SIZE * 0.78)
    page_bottom = int(SIZE * 0.86)
    page_radius = int(SIZE * 0.03)

    # Shadow behind the page
    shadow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_layer)
    for i in range(15, 0, -1):
        alpha = max(5, 30 - i * 2)
        sdraw.rounded_rectangle(
            [page_left + i // 2, page_top + i + 2, page_right + i // 2, page_bottom + i + 2],
            radius=page_radius,
            fill=(0, 0, 0, alpha),
        )
    img = Image.alpha_composite(img, shadow_layer)
    draw = ImageDraw.Draw(img)

    # Stacked pages behind (subtle depth effect)
    # Back page 2
    draw.rounded_rectangle(
        [page_left + 14, page_top - 14, page_right + 14, page_bottom - 14],
        radius=page_radius,
        fill=(225, 235, 232, 180),
    )
    # Back page 1
    draw.rounded_rectangle(
        [page_left + 7, page_top - 7, page_right + 7, page_bottom - 7],
        radius=page_radius,
        fill=(240, 248, 246, 220),
    )

    # Main page (white with slight warm tint)
    # Page gradient: white at top, very slightly gray at bottom
    draw.rounded_rectangle(
        [page_left, page_top, page_right, page_bottom],
        radius=page_radius,
        fill=(252, 253, 253, 255),
    )

    # Subtle page gradient overlay
    page_grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pgdraw = ImageDraw.Draw(page_grad)
    page_height = page_bottom - page_top
    for i in range(page_height):
        alpha = min(15, i * 15 // page_height)
        y = page_top + i
        pgdraw.rectangle(
            [page_left, y, page_right, y + 1], fill=(200, 210, 208, alpha)
        )
    page_mask = Image.new("L", (SIZE, SIZE), 0)
    pm_draw = ImageDraw.Draw(page_mask)
    pm_draw.rounded_rectangle(
        [page_left, page_top, page_right, page_bottom],
        radius=page_radius,
        fill=255,
    )
    img = Image.composite(Image.alpha_composite(img, page_grad), img, page_mask)
    draw = ImageDraw.Draw(img)

    # --- Text lines (dark rounded bars) ---
    line_left = int(SIZE * 0.27)
    line_widths = [0.38, 0.34, 0.30]  # Decreasing widths
    line_height = int(SIZE * 0.035)
    line_radius = line_height // 2
    line_start_y = int(SIZE * 0.36)
    line_spacing = int(SIZE * 0.10)

    for i, width_frac in enumerate(line_widths):
        y = line_start_y + i * line_spacing
        line_right = line_left + int(SIZE * width_frac)
        # Gradient from dark to slightly lighter
        darkness = 60 + i * 8
        line_color = (darkness, darkness + 5, darkness + 10)
        draw.rounded_rectangle(
            [line_left, y, line_right, y + line_height],
            radius=line_radius,
            fill=line_color,
        )

    # --- Orange bookmark ribbon ---
    ribbon_left = int(SIZE * 0.62)
    ribbon_right = int(SIZE * 0.70)
    ribbon_top = page_top - 5
    ribbon_bottom = int(SIZE * 0.32)
    ribbon_notch = int(SIZE * 0.028)  # V-notch depth

    # Ribbon color (coral/orange)
    ribbon_color = (235, 110, 75)
    ribbon_shadow = (200, 85, 55)

    # Draw ribbon body
    ribbon_points = [
        (ribbon_left, ribbon_top),
        (ribbon_right, ribbon_top),
        (ribbon_right, ribbon_bottom),
        ((ribbon_left + ribbon_right) // 2, ribbon_bottom - ribbon_notch),
        (ribbon_left, ribbon_bottom),
    ]
    draw.polygon(ribbon_points, fill=ribbon_color)

    # Subtle ribbon highlight (left edge)
    highlight_points = [
        (ribbon_left, ribbon_top),
        (ribbon_left + 8, ribbon_top),
        (ribbon_left + 8, ribbon_bottom - 5),
        (ribbon_left, ribbon_bottom),
    ]
    draw.polygon(highlight_points, fill=(245, 130, 95))

    # Subtle ribbon shadow (right edge)
    shadow_points = [
        (ribbon_right - 6, ribbon_top),
        (ribbon_right, ribbon_top),
        (ribbon_right, ribbon_bottom),
        (ribbon_right - 6, ribbon_bottom - 2),
    ]
    draw.polygon(shadow_points, fill=ribbon_shadow)

    # --- Apply macOS icon mask (rounded superellipse) ---
    # Create the final mask
    final_mask = rounded_rect_mask(SIZE, bg_radius)

    # Apply mask to create clean edges
    output = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    output.paste(img, mask=final_mask)

    output.save(output_path, "PNG")
    print(f"Created: {output_path} ({SIZE}x{SIZE})")
    return output_path


if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "icon-source.png"
    )
    create_icon(output)

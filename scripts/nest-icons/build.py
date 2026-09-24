#!/usr/bin/env python3
"""Nest role icon family — single source of truth.

Edit the palette / glyph functions below, then run:

    python3 build.py            # writes ../../icons/file_type_nest_{role}_{ts|js}.svg
    python3 build.py --check    # verifies generated icons without changing files

Grid: 32x32 viewBox. The role glyph owns the canvas; the language chip owns the
bottom-right 12x12 square (x,y 19..31). Glyph paint is clipped away from the chip
by a 1.5-unit gap so the chip never merges with the glyph on any background.
Glyphs are drawn "L-aware": the important features live along the top and left
edges, so the chip only ever removes a non-essential corner.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "icons"))

# ---------------------------------------------------------------------------
# Palette. One hue per role; all "main" colours sit in a mid-luminance band so
# they keep >= ~3:1 contrast against both #1e1e1e (Dark+) and #ffffff (Light+).
# The blue ~212deg slot is left empty on purpose: it belongs to the TS chip.
# ---------------------------------------------------------------------------
PALETTE = {
    #  role          main       note
    "module":      "#E0234E",  # Nest crimson: the root of every Nest app
    "controller":  "#EE6A1B",  # orange: the entry point / road-sign
    "filter":      "#C68804",  # amber: exceptions, warning
    "decorator":   "#74A00E",  # lime
    "guard":       "#22A04E",  # green: allowed / protected
    "middleware":  "#0B9E90",  # teal
    "pipe":        "#1B9CCB",  # cyan: fluid through a pipe
    "gateway":     "#5C5FE3",  # indigo: signal / realtime
    "service":     "#9152EE",  # violet: the engine
    "interceptor": "#C93DB3",  # magenta
    "adapter":     "#6E7F96",  # slate: neutral hardware
}

TS_CHIP = {"fill": "#3178C6", "ink": "#FFFFFF", "edge": None}
JS_CHIP = {"fill": "#F7DF1E", "ink": "#1E1E1E", "edge": "#B49F00"}

CHIP_X, CHIP_Y, CHIP_S, CHIP_R = 19.0, 19.0, 12.0, 2.5
GAP = 1.5  # knockout between glyph and chip


def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _mix(c, other, t):
    a, b = _hex(c), _hex(other)
    return "#%02X%02X%02X" % tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def tint(c, t=0.32):
    return _mix(c, "#FFFFFF", t)


def shade(c, t=0.26):
    return _mix(c, "#000000", t)


def f(v):
    """Compact number formatting."""
    s = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def rrect(x, y, w, h, r):
    return (f"M{f(x + r)} {f(y)}H{f(x + w - r)}A{f(r)} {f(r)} 0 0 1 {f(x + w)} {f(y + r)}"
            f"V{f(y + h - r)}A{f(r)} {f(r)} 0 0 1 {f(x + w - r)} {f(y + h)}"
            f"H{f(x + r)}A{f(r)} {f(r)} 0 0 1 {f(x)} {f(y + h - r)}"
            f"V{f(y + r)}A{f(r)} {f(r)} 0 0 1 {f(x + r)} {f(y)}Z")


def circle_path(cx, cy, r):
    return (f"M{f(cx - r)} {f(cy)}A{f(r)} {f(r)} 0 1 0 {f(cx + r)} {f(cy)}"
            f"A{f(r)} {f(r)} 0 1 0 {f(cx - r)} {f(cy)}Z")


def poly(points):
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in points) + "Z"


def fill(d, color, evenodd=False):
    rule = ' fill-rule="evenodd"' if evenodd else ""
    return f'<path fill="{color}"{rule} d="{d}"/>'


def stroke(d, color, w, cap="round", join="round"):
    return (f'<path fill="none" stroke="{color}" stroke-width="{f(w)}" '
            f'stroke-linecap="{cap}" stroke-linejoin="{join}" d="{d}"/>')


def inset_polygon(pts, d):
    """Inset a convex polygon (clockwise on screen) by distance d."""
    n = len(pts)
    lines = []
    for i in range(n):
        (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        L = math.hypot(ex, ey)
        nx, ny = -ey / L, ex / L  # inward normal for clockwise-on-screen polygons
        lines.append(((x1 + nx * d, y1 + ny * d), (ex, ey)))
    out = []
    for i in range(n):
        (p, r), (q, s) = lines[i - 1], lines[i]
        cross = r[0] * s[1] - r[1] * s[0]
        t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / cross
        out.append((p[0] + t * r[0], p[1] + t * r[1]))
    return out


# ---------------------------------------------------------------------------
# Role glyphs. Each returns SVG markup in the 32-unit grid.
# ---------------------------------------------------------------------------

def g_controller(c):
    """Signpost: requests arrive and get routed. Two plates point opposite ways."""
    pole = fill(rrect(10, 1.5, 3.6, 29, 1.3), shade(c, 0.18))
    plate_a = fill("M4.3 3.6H23.1L28.9 8.8L23.1 14H4.3A1.6 1.6 0 0 1 2.7 12.4V5.2A1.6 1.6 0 0 1 4.3 3.6Z", c)
    plate_b = fill("M16.6 16.6A1.6 1.6 0 0 1 18.2 18.2V23.8A1.6 1.6 0 0 1 16.6 25.4H7.5L2.2 21L7.5 16.6Z", c)
    return pole + plate_a + plate_b


def g_service(c):
    """Gear: the working engine that does the business logic."""
    cx, cy, ro, ri, n = 13.5, 13.5, 12.6, 9.3, 8
    tip, root = 9.5, 14.0
    d = []
    for i in range(n):
        a = i * 360 / n
        p1 = polar(cx, cy, ri, a - root)
        p2 = polar(cx, cy, ro, a - tip)
        p3 = polar(cx, cy, ro, a + tip)
        p4 = polar(cx, cy, ri, a + root)
        nxt = polar(cx, cy, ri, a + 360 / n - root)
        if i == 0:
            d.append(f"M{f(p1[0])} {f(p1[1])}")
        d.append(f"L{f(p2[0])} {f(p2[1])}")
        d.append(f"A{f(ro)} {f(ro)} 0 0 1 {f(p3[0])} {f(p3[1])}")
        d.append(f"L{f(p4[0])} {f(p4[1])}")
        d.append(f"A{f(ri)} {f(ri)} 0 0 1 {f(nxt[0])} {f(nxt[1])}")
    d.append("Z")
    return fill("".join(d) + circle_path(cx, cy, 4.1), c, evenodd=True)


def g_module(c):
    """Isometric cube: a self-contained unit that packages the others."""
    cx = 13.2
    top, ul, ur = (cx, 1.4), (2.2, 7.6), (24.2, 7.6)
    mid = (cx, 13.8)
    ll, lr, bot = (2.2, 20.2), (24.2, 20.2), (cx, 26.4)
    faces = [
        ([top, ur, mid, ul], tint(c, 0.30)),
        ([ul, mid, bot, ll], c),
        ([mid, ur, lr, bot], shade(c, 0.22)),
    ]
    out = []
    for pts, col in faces:
        out.append(fill(poly(inset_polygon(pts, 0.75)), col))
    return "".join(out)


def g_guard(c):
    """Shield with a keyhole: decides whether the request may pass."""
    shield = ("M12.8 1.4C16.6 3.4 19.7 4.2 23.4 4.3V12.6C23.4 19.4 19.2 24.4 12.8 27.6"
              "C6.4 24.4 2.2 19.4 2.2 12.6V4.3C5.9 4.2 9 3.4 12.8 1.4Z")
    # keyhole: circle (12.8, 11.2) r3.1 joined to a tapered slot
    hole = ("M11.45 14.0A3.1 3.1 0 1 1 14.15 14.0L14.9 19.1A0.8 0.8 0 0 1 14.1 20H11.5"
            "A0.8 0.8 0 0 1 10.7 19.1Z")
    return fill(shield + hole, c, evenodd=True)


def g_filter(c):
    """Funnel with an exclamation: catches exceptions and shapes the response."""
    funnel = ("M3.6 2.6H25.4A1.2 1.2 0 0 1 26.3 4.6L17 15.6V24.7A1.2 1.2 0 0 1 16.4 25.8"
              "L12.6 28A0.9 0.9 0 0 1 11.3 27.2V15.6L2.7 4.6A1.2 1.2 0 0 1 3.6 2.6Z")
    bang = rrect(13.05, 5.2, 2.3, 5.2, 1.15) + circle_path(14.2, 12.6, 1.3)
    return fill(funnel + bang, c, evenodd=True)


def g_pipe(c):
    """Elbow pipe with flanged ends: data flows in, gets transformed/validated."""
    # 8-unit bore, outer bend radius 8; flanges overhang the bore by 1.4 each side
    body = "M26 3.4H11.2A8 8 0 0 0 3.2 11.4V26H11.2V13.2A1.8 1.8 0 0 1 13 11.4H26Z"
    flange_r = rrect(24.8, 2, 4.4, 10.8, 1.1)
    flange_b = rrect(1.8, 24.8, 10.8, 4.4, 1.1)
    collar = shade(c, 0.2)
    return fill(body, c) + fill(flange_r, collar) + fill(flange_b, collar)


def g_middleware(c):
    """An arrow passing through a layer: runs in the middle of the request flow."""
    # A wide vertical "layer" split by the request arrow (2-unit gaps above/below
    # the shaft), so it reads as the arrow piercing the layer, not a dotted line.
    wall = shade(c, 0.18)
    top = fill(rrect(10.4, 1.4, 6.2, 6.6, 1.6), wall)
    bottom = fill(rrect(10.4, 16.4, 6.2, 12.8, 1.6), wall)
    arrow = fill("M2.8 10H20.8V6.2L29.4 12.2L20.8 18.2V14.4H2.8A1.4 1.4 0 0 1 1.4 13V11.4"
                 "A1.4 1.4 0 0 1 2.8 10Z", c)
    return top + bottom + arrow


def g_interceptor(c):
    """A path that wraps around the handler: acts before *and* after it runs."""
    wrap = stroke("M16.6 20.6H10.4A7.1 7.1 0 0 1 10.4 6.4H20.4", c, 4, cap="butt")
    head = fill("M19.6 0.9L28.9 6.4L19.6 11.9Z", c)
    core = fill(rrect(10.2, 10.5, 5.8, 5.8, 1.3), c)
    return wrap + head + core


def g_decorator(c):
    """The @ sign itself: TypeScript decorators are how Nest wires everything."""
    cx, cy, ro, ri, w = 12.4, 12.4, 9.9, 3.8, 3.1
    sx = cx + ri
    tail = polar(cx, cy, ro, 58)
    ring = circle_path(cx, cy, ri)
    d = (f"M{f(sx)} {f(cy - 4.6)}V{f(cy + 2)}"
         f"C{f(sx)} {f(cy + 4.6)} {f(sx + 1.3)} {f(cy + 5.3)} {f(sx + 2.8)} {f(cy + 5.3)}"
         f"C{f(sx + 4.7)} {f(cy + 5.3)} {f(cx + ro)} {f(cy + 3.4)} {f(cx + ro)} {f(cy)}"
         f"A{f(ro)} {f(ro)} 0 1 0 {f(tail[0])} {f(tail[1])}")
    return stroke(ring, c, w) + stroke(d, c, w)


def g_gateway(c):
    """Broadcast tower: realtime (WebSocket) events radiating to clients."""
    cx, cy = 13.3, 10.2
    mast = fill("M12.1 12.8H14.5L17 28.4A0.9 0.9 0 0 1 16.1 29.4H10.5A0.9 0.9 0 0 1 9.6 28.4Z", c)
    dot = fill(circle_path(cx, cy, 3.1), c)
    arcs = []
    for r in (6.9, 11.4):
        for side in (0, 180):
            a0, a1 = side - 40, side + 40
            p0, p1 = polar(cx, cy, r, a0), polar(cx, cy, r, a1)
            arcs.append(f"M{f(p0[0])} {f(p0[1])}A{f(r)} {f(r)} 0 0 1 {f(p1[0])} {f(p1[1])}")
    return mast + dot + stroke("".join(arcs), c, 3.0)


def g_adapter(c):
    """Plug: bridges Nest onto a concrete platform (Express, Fastify, ...)."""
    prongs = rrect(7.6, 1.3, 2.8, 7, 0.9) + rrect(14.6, 1.3, 2.8, 7, 0.9)
    body = ("M4.4 7.2H20.6A1.2 1.2 0 0 1 21.8 8.4V12.2C21.8 16.1 18.9 18.9 15.2 19.4"
            "H9.8C6.1 18.9 3.2 16.1 3.2 12.2V8.4A1.2 1.2 0 0 1 4.4 7.2Z")
    cord = stroke("M12.5 18.8V22.4C12.5 26.3 9.6 28.6 3.2 28.6", c, 3.0)
    return fill(prongs, shade(c, 0.15)) + fill(body, c) + cord


GLYPHS = {
    "adapter": g_adapter,
    "controller": g_controller,
    "decorator": g_decorator,
    "filter": g_filter,
    "gateway": g_gateway,
    "guard": g_guard,
    "interceptor": g_interceptor,
    "middleware": g_middleware,
    "module": g_module,
    "pipe": g_pipe,
    "service": g_service,
}

# ---------------------------------------------------------------------------
# Language chip: TS = dark blue chip / light ink, JS = light yellow chip / dark
# ink. The polarity flip means TS and JS differ even in pure greyscale.
# ---------------------------------------------------------------------------

def _letter_T(x, y, ink):
    return fill(f"M{f(x)} {f(y)}H{f(x + 4.3)}V{f(y + 1.5)}H{f(x + 2.9)}V{f(y + 6.2)}"
                f"H{f(x + 1.4)}V{f(y + 1.5)}H{f(x)}Z", ink)


def _letter_S(x, y, ink):
    ox, oy = x + 0.75, y + 0.75
    P = lambda px, py: f"{f(ox + px)} {f(oy + py)}"
    d = (f"M{P(2.8, 0.55)}C{P(2.5, 0.15)} {P(2, 0)} {P(1.4, 0)}"
         f"C{P(0.55, 0)} {P(0, 0.5)} {P(0, 1.2)}C{P(0, 1.95)} {P(0.6, 2.2)} {P(1.4, 2.38)}"
         f"C{P(2.2, 2.56)} {P(2.8, 2.85)} {P(2.8, 3.6)}C{P(2.8, 4.3)} {P(2.2, 4.7)} {P(1.4, 4.7)}"
         f"C{P(0.75, 4.7)} {P(0.2, 4.45)} {P(-0.05, 4.05)}")
    return stroke(d, ink, 1.5, cap="butt")


def _letter_J(x, y, ink):
    ox = x + 0.75
    P = lambda px, py: f"{f(ox + px)} {f(y + py)}"
    d = (f"M{P(2.8, 0)}V{f(y + 3.9)}C{P(2.8, 5)} {P(2.15, 5.45)} {P(1.35, 5.45)}"
         f"C{P(0.6, 5.45)} {P(0.1, 5.05)} {P(-0.1, 4.4)}")
    return stroke(d, ink, 1.5, cap="butt")


def chip(lang):
    spec = TS_CHIP if lang == "ts" else JS_CHIP
    out = [fill(rrect(CHIP_X, CHIP_Y, CHIP_S, CHIP_S, CHIP_R), spec["fill"])]
    if spec["edge"]:
        e = 0.45
        out.append(f'<path fill="none" stroke="{spec["edge"]}" stroke-width="0.9" d="'
                   f'{rrect(CHIP_X + e, CHIP_Y + e, CHIP_S - 2 * e, CHIP_S - 2 * e, CHIP_R - e)}"/>')
    lx, ly = CHIP_X + 1.35, CHIP_Y + 3.3  # two 4.3-wide letters + 0.7 gap, bottom-weighted
    first = _letter_T if lang == "ts" else _letter_J
    out.append(first(lx, ly, spec["ink"]))
    out.append(_letter_S(lx + 5.0, ly, spec["ink"]))
    return "".join(out)


def knockout_clip():
    g = GAP
    hole = rrect(CHIP_X - g, CHIP_Y - g, CHIP_S + 2 * g + 4, CHIP_S + 2 * g + 4, CHIP_R + g)
    return (f'<clipPath id="nk"><path clip-rule="evenodd" d="M-1 -1H33V33H-1Z{hole}"/></clipPath>')


def icon(role, lang):
    name = f"file_type_nest_{role}_{lang}"
    body = GLYPHS[role](PALETTE[role])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
            f"<title>{name}</title><defs>{knockout_clip()}</defs>"
            f'<g clip-path="url(#nk)">{body}</g>{chip(lang)}</svg>\n')


# ---------------------------------------------------------------------------

def _lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in _hex(c))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def report():
    print(f"{'role':12} {'main':8} {'vs #1e1e1e':>10} {'vs #fff':>8}")
    for role, c in PALETTE.items():
        print(f"{role:12} {c:8} {contrast(c, '#1E1E1E'):10.2f} {contrast(c, '#FFFFFF'):8.2f}")
    for name, spec in (("TS chip", TS_CHIP), ("JS chip", JS_CHIP)):
        print(f"{name:12} {spec['fill']:8} {contrast(spec['fill'], '#1E1E1E'):10.2f} "
              f"{contrast(spec['fill'], '#FFFFFF'):8.2f}   ink {contrast(spec['fill'], spec['ink']):.2f}")


def main():
    checking = "--check" in sys.argv
    if not checking:
        os.makedirs(OUT, exist_ok=True)
    mismatches = []
    for role in GLYPHS:
        for lang in ("ts", "js"):
            path = os.path.join(OUT, f"file_type_nest_{role}_{lang}.svg")
            expected = icon(role, lang)
            if checking:
                if not os.path.exists(path) or open(path, encoding="utf-8").read() != expected:
                    mismatches.append(path)
            else:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(expected)
    if checking:
        report()
        if mismatches:
            for path in mismatches:
                print(f"out of date: {path}", file=sys.stderr)
            raise SystemExit(1)
        print(f"verified {len(GLYPHS) * 2} icons")
    else:
        print(f"wrote {len(GLYPHS) * 2} icons to {OUT}")


if __name__ == "__main__":
    main()

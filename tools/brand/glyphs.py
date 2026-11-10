"""
The letter outlines for the 3D logo (tools/brand/glyphs.json), taken once from Inter (shipped on the dev machine as
"Adwaita Sans", SIL Open Font License 1.1: (c) 2016 The Inter Project Authors) so the logo tool needs no font and no
network. Two cuts of the variable font: `big` = Black at the display optical size (KARDASHEV), `small` = Bold at
the text optical size (THE, PROJECT). Only the letters the logo uses; the advances carry HarfBuzz's kerning.

  python -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools uharfbuzz
  /tmp/ft/bin/python tools/brand/glyphs.py [/usr/share/fonts/Adwaita/AdwaitaSans-Regular.ttf]
"""
import io
import json
import os
import sys

import uharfbuzz as hb
from fontTools.pens.basePen import decomposeQuadraticSegment
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/Adwaita/AdwaitaSans-Regular.ttf'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glyphs.json')
CUTS = {
    'big': ({'wght': 900, 'opsz': 32}, ['KARDASHEV']),
    'small': ({'wght': 700, 'opsz': 14}, ['THE', 'PROJECT']),
}


def cut(axes, words):
    font = instancer.instantiateVariableFont(TTFont(SRC), axes)
    buf = io.BytesIO()
    font.save(buf)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    glyphs = {}
    for ch in sorted(set(''.join(words))):
        name = cmap[ord(ch)]
        pen = DecomposingRecordingPen(gs)
        gs[name].draw(pen)
        path = []
        for op, pts in pen.value:
            if op == 'moveTo':
                path.append(['M', *pts[0]])
            elif op == 'lineTo':
                path.append(['L', *pts[0]])
            elif op == 'qCurveTo':
                for c, p in decomposeQuadraticSegment(pts):
                    path.append(['Q', *c, *p])
            elif op == 'curveTo':
                path.append(['C', *pts[0], *pts[1], *pts[2]])
            elif op == 'closePath':
                path.append(['Z'])
        glyphs[ch] = {'adv': gs[name].width, 'path': [[c[0], *[round(v, 2) for v in c[1:]]] for c in path]}
    # advances per word, kerning applied
    hbf = hb.Font(hb.Face(buf.getvalue()))
    lines = {}
    for w in words:
        b = hb.Buffer()
        b.add_str(w)
        b.guess_segment_properties()
        hb.shape(hbf, b, {'kern': True})
        lines[w] = [p.x_advance for p in b.glyph_positions]
    return {'unitsPerEm': font['head'].unitsPerEm, 'capHeight': font['OS/2'].sCapHeight, 'glyphs': glyphs, 'advances': lines}


data = {'font': 'Inter (Adwaita Sans), SIL Open Font License 1.1, (c) 2016 The Inter Project Authors', **{k: cut(*v) for k, v in CUTS.items()}}
with open(OUT, 'w') as f:
    json.dump(data, f, separators=(',', ':'))
print(OUT, os.path.getsize(OUT), 'bytes')

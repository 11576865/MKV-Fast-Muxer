"""Test-only real TTF/CFF collection fixtures, derived from installed DejaVu."""
import copy, hashlib, json, os, sys
from pathlib import Path
from fontTools.ttLib import TTFont, TTCollection
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

out = Path(sys.argv[1] if len(sys.argv) > 1 else '.e2e/s03-fonts')
out.mkdir(parents=True, exist_ok=True)
paths = [os.environ.get('E2E_FONT_REGULAR', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
         os.environ.get('E2E_FONT_BOLD', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')]

def rename(font, family, style):
    names = {1:family, 2:style, 3:family+';'+style+';S03', 4:family+' '+style,
             6:family.replace(' ','')+'-'+style, 16:family, 17:style}
    for record in font['name'].names:
        if record.nameID in names:
            font['name'].setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
    return font

def cff_font(source, family, style):
    order = source.getGlyphOrder()
    glyphs = source.getGlyphSet()
    metrics = source['hmtx'].metrics
    charstrings = {}
    for name in order:
        pen = T2CharStringPen(metrics[name][0], glyphs)
        glyphs[name].draw(pen)
        charstrings[name] = pen.getCharString()
    builder = FontBuilder(source['head'].unitsPerEm, isTTF=False)
    builder.setupGlyphOrder(order)
    builder.setupCharacterMap(source.getBestCmap())
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=source['hhea'].ascent, descent=source['hhea'].descent)
    builder.setupNameTable({'familyName':family, 'styleName':style,
        'uniqueFontIdentifier':family+';'+style+';S03', 'fullName':family+' '+style,
        'psName':family.replace(' ','')+'-'+style,
        'typographicFamily':family, 'typographicSubfamily':style})
    o = source['OS/2']
    builder.setupOS2(sTypoAscender=o.sTypoAscender, sTypoDescender=o.sTypoDescender,
        sTypoLineGap=o.sTypoLineGap, usWinAscent=o.usWinAscent, usWinDescent=o.usWinDescent,
        usWeightClass=700 if style=='Bold' else 400, fsSelection=32 if style=='Bold' else 64)
    builder.font['head'].macStyle = 1 if style=='Bold' else 0
    builder.setupPost()
    builder.setupCFF(family.replace(' ','')+'-'+style,
        {'FullName':family+' '+style, 'FamilyName':family, 'Weight':style}, charstrings, {})
    # Preserve real shaping/positioning rules with the same glyph names/order.
    for tag in ['GDEF','GSUB','GPOS']:
        assert tag in source
        builder.font[tag] = copy.deepcopy(source[tag])
    return builder.font

families = {'ttc':'UIGS S03 TrueType Proof', 'otc':'UIGS S03 OpenType Proof'}
true_faces=[]; cff_faces=[]
for source_path, style in zip(paths, ['Regular','Bold']):
    src=TTFont(source_path)
    true_faces.append(rename(copy.deepcopy(src), families['ttc'], style))
    cff_faces.append(cff_font(src, families['otc'], style))
for name, faces in [('TrueTypeProof.ttc',true_faces), ('OpenTypeProof.otc',cff_faces)]:
    collection=TTCollection();collection.fonts=faces;collection.save(out/name)
cff_faces[0].save(out/'OpenTypeProof.otf')
true_faces[0].save(out/'TrueTypeRegularOnly.ttf')
cff_faces[0].save(out/'OpenTypeRegularOnly.otf')
manifest={'schema':'softmux-s03-real-font-fixtures-v1', 'families':families,
 'provenance':'Installed DejaVu Regular/Bold; real outlines and real GDEF/GSUB/GPOS, uniquely renamed for fallback isolation',
 'source_sha256':[hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths], 'files':{}}
for p in sorted(out.glob('*')):
    if p.suffix not in ['.ttc','.otc','.otf','.ttf']:continue
    faces=TTCollection(p).fonts if p.read_bytes()[:4]==b'ttcf' else [TTFont(p)]
    info=[{'family':f['name'].getBestFamilyName(), 'style':f['name'].getBestSubFamilyName(),
           'scaler':f.sfntVersion, 'cff':'CFF ' in f, 'glyphs':len(f.getGlyphOrder()),
           'layout':[t for t in ['GDEF','GSUB','GPOS'] if t in f]} for f in faces]
    if p.suffix=='.otc':assert len(faces)==2 and all(f.sfntVersion=='OTTO' and 'CFF ' in f for f in faces)
    manifest['files'][p.name]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes':p.stat().st_size, 'faces':info}
(out/'fixture-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('S03 real two-face TTC/CFF OTC and layout-preserving OTF generated')

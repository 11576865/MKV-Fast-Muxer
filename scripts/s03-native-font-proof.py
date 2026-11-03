"""Independent native fontTools + system HarfBuzz oracle, never product code."""
import ctypes as C, ctypes.util, json, sys
from pathlib import Path
from fontTools.ttLib import TTFont, TTCollection

mode, path = sys.argv[1:3]
if mode=='inspect':
    data=Path(path).read_bytes();faces=TTCollection(path).fonts if data[:4]==b'ttcf' else [TTFont(path)]
    required=sys.argv[3] if len(sys.argv)>3 else ''
    print(json.dumps({'faces':[{'family':f['name'].getBestFamilyName(), 'style':f['name'].getBestSubFamilyName(),
        'postScript':f['name'].getDebugName(6), 'weight':f['OS/2'].usWeightClass,
        'cff':'CFF ' in f, 'glyphs':len(f.getGlyphOrder()),
        'layout':[t for t in ['GDEF','GSUB','GPOS'] if t in f],
        'missing':sorted({ord(ch) for ch in required if ord(ch) not in f.getBestCmap()})} for f in faces]}))
elif mode=='strip-layout':
    f=TTFont(path)
    for tag in ['GSUB','GPOS','GDEF']:
        if tag in f:del f[tag]
    f.save(sys.argv[3])
elif mode=='shape':
    text=sys.argv[3];index=int(sys.argv[4]) if len(sys.argv)>4 else 0
    lib=C.CDLL(ctypes.util.find_library('harfbuzz'))
    def function(name, restype, *args):
        fn=getattr(lib,name);fn.restype=restype;fn.argtypes=list(args);return fn
    P=C.c_void_p;U=C.c_uint;I=C.c_int
    blob_create=function('hb_blob_create',P,P,U,I,P,P)
    face_create=function('hb_face_create',P,P,U)
    face_upem=function('hb_face_get_upem',U,P)
    font_create=function('hb_font_create',P,P)
    set_funcs=function('hb_ot_font_set_funcs',None,P)
    set_scale=function('hb_font_set_scale',None,P,I,I)
    buffer_create=function('hb_buffer_create',P)
    add=function('hb_buffer_add_utf8',None,P,C.c_char_p,I,U,I)
    guess=function('hb_buffer_guess_segment_properties',None,P)
    shape=function('hb_shape',None,P,P,P,U)
    class Info(C.Structure):_fields_=[('glyph',U),('mask',U),('cluster',U),('var1',U),('var2',U)]
    class Position(C.Structure):_fields_=[('xAdvance',I),('yAdvance',I),('xOffset',I),('yOffset',I),('var',U)]
    infos=function('hb_buffer_get_glyph_infos',C.POINTER(Info),P,C.POINTER(U))
    positions=function('hb_buffer_get_glyph_positions',C.POINTER(Position),P,C.POINTER(U))
    raw=Path(path).read_bytes();storage=C.create_string_buffer(raw)
    blob=blob_create(C.cast(storage,P),len(raw),0,None,None)
    face=face_create(blob,index);font=font_create(face);set_funcs(font)
    upem=face_upem(face);set_scale(font,upem,upem)
    buffer=buffer_create();encoded=text.encode();add(buffer,encoded,len(encoded),0,len(encoded));guess(buffer);shape(font,buffer,None,0)
    n=U();items=infos(buffer,C.byref(n));pos=positions(buffer,C.byref(n))
    result={'upem':upem,'glyphCount':n.value,'clusters':[items[i].cluster for i in range(n.value)],
        'positions':[[pos[i].xAdvance,pos[i].yAdvance,pos[i].xOffset,pos[i].yOffset] for i in range(n.value)],
        'hasNotdef':any(items[i].glyph==0 for i in range(n.value))}
    for name,obj in [('hb_buffer_destroy',buffer),('hb_font_destroy',font),('hb_face_destroy',face),('hb_blob_destroy',blob)]:
        function(name,None,P)(obj)
    print(json.dumps(result))
else:raise SystemExit('Unknown native font proof mode')

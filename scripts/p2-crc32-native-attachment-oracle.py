#!/usr/bin/env python3
"""Test-only native-source CRC fixture and INDEPENDENT zlib output oracle.

prepare SOURCE OUT: shrink the FileData of last original AttachedFile by 12
bytes; create a CRC-32 child inside that AttachedFile (+6B) and a CRC-32 child
of its enclosing Attachments (+6B). Attachment master total bytes, Segment,
SeekHead, Cues, Chapters, Tags and packet offsets remain identical.
audit FILE...: verify every direct CRC-32 in Attachments and all AttachedFile
using Python zlib.crc32 (independent of browser JavaScript implementation).
Never use this script in product writer paths.
"""
import pathlib
import struct
import sys
import zlib

IDS = dict(segment=0x18538067, attachments=0x1941a469, attached=0x61a7,
           file_data=0x465c, file_name=0x466e, crc=0xbf)
MAX_BYTES = 64*1024*1024

def element(buffer, offset, limit):
    if not 0 <= offset < limit <= len(buffer):
        raise ValueError("ORACLE_RANGE")
    first = buffer[offset]
    if not first:
        raise ValueError("ORACLE_ZERO_ID")
    id_width = next((w for w in range(1,5) if first & (0x80 >> (w-1))), None)
    if id_width is None:
        raise ValueError("ORACLE_ID_VINT")
    size_first = buffer[offset+id_width]
    if not size_first:
        raise ValueError("ORACLE_ZERO_SIZE")
    size_width = next((w for w in range(1,9) if size_first & (0x80 >> (w-1))), None)
    if size_width is None:
        raise ValueError("ORACLE_SIZE_VINT")
    size = size_first & ((1 << (8-size_width))-1)
    for i in range(1,size_width):
        size = size*256 + buffer[offset+id_width+i]
    if size == (1 << (7*size_width))-1:
        raise ValueError("ORACLE_UNKNOWN_SIZE")
    data_start = offset+id_width+size_width
    end = data_start+size
    if end>limit:
        raise ValueError("ORACLE_CHILD_EXCEEDS_MASTER")
    return dict(id=int.from_bytes(buffer[offset:offset+id_width],'big'),
        start=offset,id_width=id_width,size_width=size_width,
        size_pos=offset+id_width,data_start=data_start,end=end,size=size)

def children(buffer, start, end):
    at=start
    out=[]
    while at<end:
        if len(out)>=8192:
            raise ValueError("ORACLE_ELEMENT_BUDGET")
        item=element(buffer,at,end)
        out.append(item)
        at=item['end']
    return out

def encode_size(value,width):
    if value<0 or value >= (1 << (width*7))-1:
        raise ValueError("ORACLE_ORIGINAL_SIZE_WIDTH_EXCEEDED")
    return ((1 << (width*7)) | value).to_bytes(width,'big')

def crc_element(content):
    return b'\xbf\x84'+struct.pack('<I',zlib.crc32(content)&0xffffffff)

def find_attachment_master(data):
    ebml=element(data,0,len(data))
    segment=element(data,ebml['end'],len(data))
    if segment['id']!=IDS['segment'] or segment['end']!=len(data):
        raise ValueError("ORACLE_FINITE_SEGMENT_NOT_EXACT_EOF")
    masters=[x for x in children(data,segment['data_start'],segment['end'])
             if x['id']==IDS['attachments']]
    if len(masters)!=1:
        raise ValueError("ORACLE_ONE_ATTACHMENTS_REQUIRED")
    return masters[0]

def prepare(src, dst):
    data=src.read_bytes()
    if len(data)>MAX_BYTES:raise ValueError("ORACLE_SOURCE_TOO_BIG")
    master=find_attachment_master(data)
    entries=children(data,master['data_start'],master['end'])
    if any(x['id']==IDS['crc'] for x in entries):
        raise ValueError("ORACLE_PREEXISTING_PARENT_CRC")
    attached=[x for x in entries if x['id']==IDS['attached']]
    if len(attached)!=2:
        raise ValueError("ORACLE_SOURCE_NEEDS_TWO_ATTACHED_FILES")
    target=attached[-1]
    if entries[-1]!=target:
        raise ValueError("ORACLE_LAST_CHILD_NOT_TARGET")
    fields=children(data,target['data_start'],target['end'])
    if any(x['id']==IDS['crc'] for x in fields):
        raise ValueError("ORACLE_PREEXISTING_CHILD_CRC")
    payloads=[x for x in fields if x['id']==IDS['file_data']]
    if len(payloads)!=1:
        raise ValueError("ORACLE_FILEDATA_NOT_UNIQUE")
    payload=payloads[0]
    if payload['size']<=32:
        raise ValueError("ORACLE_NOT_ENOUGH_NATIVE_DATA_TO_RESERVE_12")
    # Keep original source FileUID and other child bytes. The selected FileData
    # loses only the final twelve test-fixture bytes.
    raw_fields=[]
    for field in fields:
        if field != payload:
            raw_fields.append(data[field['start']:field['end']])
            continue
        old_header=data[field['start']:field['size_pos']]
        old_payload=data[field['data_start']:field['end']]
        raw_fields.append(old_header+encode_size(len(old_payload)-12,
           field['size_width'])+old_payload[:-12])
    new_body=b''.join(raw_fields)
    # RFC 8794: CRC-32 MUST be the FIRST ordered child in a Master.
    new_child_data=crc_element(new_body)+new_body
    new_child=(data[target['start']:target['size_pos']]+
        encode_size(len(new_child_data),target['size_width'])+new_child_data)
    if len(new_child)!=target['end']-target['start']-6:
        raise ValueError("ORACLE_CHILD_SIZE_DELTA_WRONG")
    prefix=data[master['data_start']:target['start']]
    master_without_crc=prefix+new_child
    new_master_data=crc_element(master_without_crc)+master_without_crc
    if len(new_master_data)!=master['end']-master['data_start']:
        raise ValueError("ORACLE_PARENT_BYTE_SPAN_CHANGED")
    output=(data[:master['data_start']]+new_master_data+data[master['end']:])
    if len(output)!=len(data):
        raise ValueError("ORACLE_ORIGINAL_TOP_LEVEL_OFFSETS_CHANGED")
    dst.write_bytes(output)
    audit_file(dst)
    print("NATIVE_SOURCE_CRC_FIXTURE_PREPARED same outer Segment/SeekHead/Chapters/Tags/Cluster byte offsets", flush=True)

def verify_master_crc(data, master, label):
    rows=children(data,master['data_start'],master['end'])
    crcs=[x for x in rows if x['id']==IDS['crc']]
    if len(crcs)!=1 or crcs[0]['size']!=4:
        raise ValueError("ORACLE_EXPECTS_ONE_"+label+"_CRC32")
    crc=crcs[0]
    if crc['start']!=master['data_start']:
        raise ValueError("ORACLE_"+label+"_CRC_MUST_BE_FIRST_CHILD")
    expected=zlib.crc32(
        data[master['data_start']:crc['start']]+data[crc['end']:master['end']]
    ) & 0xffffffff
    actual=struct.unpack('<I',data[crc['data_start']:crc['end']])[0]
    if actual!=expected:
        raise ValueError("ORACLE_"+label+"_CRC_MISMATCH expected=%08x actual=%08x"%
                         (expected,actual))
    return rows

def audit_file(path):
    data=path.read_bytes()
    master=find_attachment_master(data)
    entries=verify_master_crc(data,master,"ATTACHMENTS")
    attached=[x for x in entries if x['id']==IDS['attached']]
    with_crc=[]
    for att in attached:
        fields=children(data,att['data_start'],att['end'])
        if any(x['id']==IDS['crc'] for x in fields):
            verify_master_crc(data,att,"ATTACHEDFILE")
            with_crc.append(att)
    if len(attached)!=2 or len(with_crc)!=1:
        raise ValueError("ORACLE_TWO_ATTACHMENTS_ONE_INNER_CRC_REQUIRED")
    print("PYTHON_ZLIB_NATIVE_MKV_PARENT_AND_NESTED_CRC32_PASS file="+str(path)+
          " attachments=2 innerCRCs=1 parentCRCs=1",flush=True)

def main():
    if len(sys.argv)==4 and sys.argv[1]=="prepare":
        prepare(pathlib.Path(sys.argv[2]),pathlib.Path(sys.argv[3]))
    elif len(sys.argv)==3 and sys.argv[1]=="audit":
        audit_file(pathlib.Path(sys.argv[2]))
    else:
        raise SystemExit("usage prepare native-original.mkv source-with-crc.mkv | audit output.mkv")
if __name__=="__main__":main()

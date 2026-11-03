#!/usr/bin/env python3
"""Independent scoped Matroska semantic Tag/Target UID relation oracle.

Uses mkvmerge and mkvextract (native CI/development dependencies), not a
browser writer. Compares tag references by resolved logical object role, not
raw numeric UIDs. See docs/p1-uid-role-oracle-20261103.md for limits.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

UID_TARGETS = {
    "TrackUID": "track", "AttachmentUID": "attachment",
    "ChapterUID": "chapter", "EditionUID": "edition",
}
KNOWN_TARGETS = set(UID_TARGETS) | {"TargetTypeValue", "TargetType"}
MAX_ELEMENTS = 100000


class CannotVerify(Exception):
    pass


def run(args):
    return subprocess.check_output(args, text=True, timeout=120)


def read_xml(filename, mode, directory):
    output = Path(directory) / (mode + ".xml")
    subprocess.run(["mkvextract", str(filename), mode, str(output)],
                   check=True, capture_output=True, text=True, timeout=120)
    if not output.is_file():
        raise CannotVerify("mkvextract omitted " + mode + " XML")
    return ET.parse(output).getroot()


def text(element):
    return (element.text or "").strip()


def node_tree(element, omit=frozenset(), depth=0, state=None):
    if state is None:
        state = [0]
    state[0] += 1
    if depth > 64 or state[0] > MAX_ELEMENTS:
        raise CannotVerify("XML tree exceeds bounded traversal")
    result = {"element": element.tag}
    if element.attrib:
        result["attrs"] = dict(sorted(element.attrib.items()))
    if text(element):
        result["text"] = text(element)
    children = [node_tree(c, frozenset(), depth + 1, state)
                for c in element if c.tag not in omit]
    if children:
        result["children"] = children
    return result


def safe_uid(value, category):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise CannotVerify("Missing UID for " + category)
    value = str(value).strip()
    if not value.isdecimal() or int(value) <= 0 or int(value) >= 2 ** 64:
        raise CannotVerify("Invalid uint64 UID for " + category)
    return value


def bind(catalog, uid, role, category):
    uid = safe_uid(uid, category)
    if uid in catalog:
        raise CannotVerify("Duplicate " + category + " UID: " + uid)
    catalog[uid] = role


def chapters_projection(xml):
    if xml.tag != "Chapters":
        raise CannotVerify("Unexpected chapter XML root")
    editions, chapter_uids, edition_uids = [], {}, {}
    for ei, edition in enumerate(xml.findall("EditionEntry")):
        edition_role = "edition:" + str(ei)
        ed_uid = edition.findtext("EditionUID")
        if ed_uid and ed_uid.strip() != "0":
            bind(edition_uids, ed_uid, edition_role, "Edition")
        ed = node_tree(edition, omit={"EditionUID", "ChapterAtom"})
        def visit(atom, path, depth):
            if depth > 64:
                raise CannotVerify("Chapter nesting exceeds depth limit")
            uid = atom.findtext("ChapterUID")
            bind(chapter_uids, uid, path, "Chapter")
            result = node_tree(atom, omit={"ChapterUID", "ChapterAtom"})
            result["role"] = path
            result["chapters"] = [
                visit(c, path + "/chapter:" + str(i), depth + 1)
                for i, c in enumerate(atom.findall("ChapterAtom"))
            ]
            return result
        ed["chapters"] = [
            visit(c, edition_role + "/chapter:" + str(i), 0)
            for i, c in enumerate(edition.findall("ChapterAtom"))
        ]
        editions.append(ed)
    return editions, chapter_uids, edition_uids


def mkv_roles(source, root_dir):
    data = json.loads(run(["mkvmerge", "-J", str(source)]))
    track_uids, attachment_uids = {}, {}
    tracks = []
    for i, item in enumerate(data.get("tracks") or []):
        props = item.get("properties") or {}
        role = "track:" + str(i)
        bind(track_uids, props.get("uid"), role, "Track")
        tracks.append({"role": role, "type": item.get("type"),
                       "codec": item.get("codec")})
    attachments, attachment_seen = [], set()
    for i, item in enumerate(data.get("attachments") or []):
        file_id = item.get("id")
        if isinstance(file_id, bool) or not isinstance(file_id, int):
            raise CannotVerify("Missing native attachment extraction ID")
        output = Path(root_dir) / ("payload-" + str(i) + ".bin")
        subprocess.run(
            ["mkvextract", str(source), "attachments", str(file_id) + ":" + str(output)],
            check=True, capture_output=True, text=True, timeout=120)
        if not output.is_file():
            raise CannotVerify("Independent attachment FileData extraction missing")
        payload = output.read_bytes()
        name = str(item.get("file_name") or "")
        mime = str(item.get("content_type") or "")
        signature = (name, mime, hashlib.sha256(payload).hexdigest())
        if signature in attachment_seen:
            raise CannotVerify("Ambiguous duplicate attachment logical identities")
        attachment_seen.add(signature)
        # Identity is name, MIME and complete FileData, NOT raw FileUID or
        # mkvmerge per-file extraction ID; this allows valid UID renumbering.
        role = {"name": name, "mime": mime, "sha256": signature[2]}
        bind(attachment_uids, (item.get("properties") or {}).get("uid"),
             role, "Attachment")
        attachments.append(role)
    return tracks, sorted(attachments, key=lambda x: (x["name"], x["mime"], x["sha256"])), {
        "track": track_uids, "attachment": attachment_uids,
    }


def tags_projection(xml, references):
    if xml.tag != "Tags":
        raise CannotVerify("Unexpected tags XML root")
    tags = []
    for tag in xml.findall("Tag"):
        targets = tag.findall("Targets")
        if len(targets) > 1:
            raise CannotVerify("Tag has multiple Targets masters")
        target_items = []
        if targets:
            for target in targets[0]:
                key = target.tag
                if key not in KNOWN_TARGETS:
                    raise CannotVerify("Unsupported Tag Targets child: " + key)
                uid = text(target)
                if key in UID_TARGETS:
                    if not uid.isdecimal() or int(uid) >= 2 ** 64:
                        raise CannotVerify("Invalid tag target " + key)
                    if int(uid) == 0:
                        logical = {"kind": UID_TARGETS[key], "global": True}
                    else:
                        role = references[UID_TARGETS[key]].get(uid)
                        if role is None:
                            raise CannotVerify("Dangling " + key + " reference: " + uid)
                        logical = {"kind": UID_TARGETS[key], "role": role}
                    target_items.append({"name": key, "value": logical})
                else:
                    target_items.append({"name": key, "value": uid})
        tag_children = [node_tree(x) for x in tag if x.tag != "Targets"]
        tags.append({"targets": sorted(target_items, key=lambda x: json.dumps(x, sort_keys=True)),
                     "elements": tag_children})
    # Tag masters' order is not used as object identity; duplicate Tags
    # remain observable as duplicate entries in the sorted list.
    return sorted(tags, key=lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False))


def project(root_chapters, root_tags, tracks, attachments, references):
    chapters, chapters_by_uid, editions_by_uid = chapters_projection(root_chapters)
    refs = {**references, "chapter": chapters_by_uid, "edition": editions_by_uid}
    return {
        "tracks": tracks,
        "attachments": attachments,
        "chapters": chapters,
        "tags": tags_projection(root_tags, refs),
    }


def inspect(filename):
    with tempfile.TemporaryDirectory(prefix="p1-uid-role-") as directory:
        tracks, attachments, refs = mkv_roles(filename, directory)
        chapters = read_xml(filename, "chapters", directory)
        tags = read_xml(filename, "tags", directory)
        return project(chapters, tags, tracks, attachments, refs)


def compare(source, output):
    src, dst = inspect(source), inspect(output)
    differences = []
    for field in ("tracks", "attachments", "chapters", "tags"):
        if src[field] != dst[field]:
            differences.append({
                "field": field, "code": "SEMANTIC_ROLE_DIFFERENCE",
                "source": src[field], "output": dst[field],
            })
    return {
        "schema": "softmux-p1-uid-role-independent-v1",
        "source": str(source), "output": str(output),
        "status": "SCOPED_RELATIONS_MATCH" if not differences else "DIFFERENCE_DETECTED",
        "differences": differences,
        "checked": [
            "full extracted chapter/edition structure except legitimate numeric UID remaps",
            "complete extracted Tag/SimpleTag hierarchy and all known Tag UID target roles",
            "ordered track type/codec with UID targets mapped to a positional role",
            "attachment name/MIME/whole FileData SHA, with UID targets mapped to unique payload identity",
        ],
        "notChecked": [
            "unknown EBML elements not exposed by mkvextract",
            "Track UID equivalence after same-codec/same-position content replacement or track reorder",
            "media packet SHA/PTS, other track attributes, renderer and player compatibility",
            "semantic equivalence of externally linked SegmentEditionUID and unknown Tag targets",
            "validity of input sources or user disk persistence beyond external tools",
        ],
        "caution": "Passing only proves the named independent scope; UID remaps are allowed when all checked target roles remain equivalent.",
        "tools": {
            "mkvmerge": run(["mkvmerge", "--version"]).strip(),
            "mkvextract": run(["mkvextract", "--version"]).strip(),
        },
    }


def selftest():
    ch1 = ET.fromstring(
        "<Chapters><EditionEntry><EditionUID>101</EditionUID>"
        "<ChapterAtom><ChapterUID>102</ChapterUID><ChapterString>Root</ChapterString>"
        "<ChapterAtom><ChapterUID>103</ChapterUID>"
        "<ChapterDisplay><ChapterString>Nested</ChapterString></ChapterDisplay>"
        "</ChapterAtom></ChapterAtom></EditionEntry></Chapters>")
    ch2 = ET.fromstring(ET.tostring(ch1))
    for node in ch2.iter():
        if node.tag in {"EditionUID", "ChapterUID"}:
            node.text = str(int(node.text) + 1000)
    def tag(chapter_uid, edition_uid, attach_uid, track_uid, nested=True):
        inner = "<Simple><Name>COMMENT</Name><String>Nested</String></Simple>" if nested else ""
        return ET.fromstring(
            "<Tags><Tag><Targets><ChapterUID>" + str(chapter_uid) +
            "</ChapterUID><EditionUID>" + str(edition_uid) +
            "</EditionUID><AttachmentUID>" + str(attach_uid) +
            "</AttachmentUID><TrackUID>" + str(track_uid) +
            "</TrackUID></Targets><Simple><Name>DIRECTOR</Name><String>Ordinary</String>" +
            inner + "</Simple></Tag></Tags>")
    tracks = [{"role": "track:0", "type": "video", "codec": "AVC"}]
    attaches = [{"name": "guide.txt", "mime": "text/plain", "sha256": "abcd"}]
    r1 = {"track": {"99": "track:0"}, "attachment": {"88": attaches[0]}}
    r2 = {"track": {"999": "track:0"}, "attachment": {"888": attaches[0]}}
    src = project(ch1, tag(103, 101, 88, 99), tracks, attaches, r1)
    remapped = project(ch2, tag(1103, 1101, 888, 999), tracks, attaches, r2)
    assert src == remapped, "referentially intact UID remap must be accepted"
    wrong_target = project(ch2, tag(1102, 1101, 888, 999), tracks, attaches, r2)
    assert wrong_target != src, "parent vs child target change must fail"
    missing_nested = project(ch2, tag(1103, 1101, 888, 999, False), tracks, attaches, r2)
    assert missing_nested != src, "unmarked nested SimpleTag loss must fail"
    for bad in (tag(987654, 1101, 888, 999), tag(1103, 1101, 1234, 999)):
        try:
            project(ch2, bad, tracks, attaches, r2)
            raise AssertionError("dangling target accepted")
        except CannotVerify:
            pass
    big = {"track": {"9007199254740993": "track:0"}, "attachment": {"88": attaches[0]}}
    project(ch1, tag(103, 101, 88, "9007199254740993"), tracks, attaches, big)
    print("P1 UID role selftest: PASS (UID remap, wrong targets, nested loss, dangling, uint64)")


def main():
    if sys.argv[1:] == ["--selftest"]:
        selftest()
        return
    if len(sys.argv) != 4:
        sys.exit("Usage: p1-uid-role-oracle.py SOURCE.mkv OUTPUT.mkv REPORT.json | --selftest")
    source, output, report_file = sys.argv[1:]
    exit_code = 0
    try:
        result = compare(source, output)
        if result["differences"]:
            exit_code = 2
    except Exception as err:
        result = {
            "schema": "softmux-p1-uid-role-independent-v1",
            "source": source, "output": output,
            "status": "CHECK_UNAVAILABLE", "error": str(err),
        }
        exit_code = 3
    Path(report_file).parent.mkdir(parents=True, exist_ok=True)
    Path(report_file).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf-8")
    print("P1 UID role oracle: " + result["status"])
    print("P1 report: " + report_file)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

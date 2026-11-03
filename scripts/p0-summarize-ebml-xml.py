#!/usr/bin/env python3
"""Summarize independently extracted Matroska XML for scoped P0 audit.

Reads XML written by `mkvextract FILE chapters` or `mkvextract FILE tags`
on stdin; writes JSON on stdout. Uses Python standard library only.
"""
import json
import sys
import xml.etree.ElementTree as ET


def text(node, child):
    found = node.find(child)
    return (found.text or "").strip() if found is not None else ""


def chapter(atom):
    displays = []
    for display in atom.findall("ChapterDisplay"):
        displays.append({
            "name": text(display, "ChapterString"),
            "language": text(display, "ChapterLanguage"),
            "country": text(display, "ChapterCountry"),
        })
    return {
        "uid": text(atom, "ChapterUID"),
        "start": text(atom, "ChapterTimeStart"),
        "end": text(atom, "ChapterTimeEnd"),
        "displays": displays,
        "children": [chapter(c) for c in atom.findall("ChapterAtom")],
    }


def chapters(root):
    return [
        {
            "editionUid": text(e, "EditionUID"),
            "editionFlagDefault": text(e, "EditionFlagDefault"),
            "editionFlagOrdered": text(e, "EditionFlagOrdered"),
            "chapters": [chapter(c) for c in e.findall("ChapterAtom")],
        }
        for e in root.findall(".//EditionEntry")
    ]


def tags(root):
    result = []
    for item in root.findall("./Tag"):
        target = item.find("Targets")
        targets = {}
        if target is not None:
            for entry in target:
                if entry.tag in (
                    "TargetTypeValue", "TargetType", "TrackUID",
                    "EditionUID", "ChapterUID", "AttachmentUID"
                ):
                    targets[entry.tag] = (entry.text or "").strip()
        for simple in item.findall(".//Simple"):
            name = text(simple, "Name")
            # Scope is deliberately limited to fixture-controlled names.
            # Muxer-generated Statistics_* tags are not correctness claims.
            if name.startswith("P0_"):
                result.append({
                    "targets": targets,
                    "name": name,
                    "string": text(simple, "String"),
                    "binary": text(simple, "Binary"),
                    "language": text(simple, "TagLanguage"),
                })
    return sorted(result, key=lambda value: json.dumps(value, sort_keys=True))



def complete_xml(root, kind):
    """Faithful *extracted XML* projection; do not equate a diff with data loss.

    Keep EVERY descendant and known/unknown XML field, preserving order and
    multiplicity. In particular, do not flatten nested SimpleTags or filter
    out unmarked tags as the older P0-only summarizer deliberately did.
    """
    expected = "Chapters" if kind == "complete-chapters" else "Tags"
    if root.tag != expected:
        raise ValueError("Unexpected mkvextract XML root: " + root.tag)
    limit = 200000
    seen = 0

    def node(element, depth=0):
        nonlocal seen
        seen += 1
        if seen > limit or depth > 64:
            raise ValueError("Extracted XML exceeds bounded projection budget")
        result = {"element": element.tag}
        if element.attrib:
            result["attributes"] = dict(sorted(element.attrib.items()))
        value = (element.text or "").strip()
        if value:
            result["text"] = value
        children = []
        for child in element:
            if (child.tail or "").strip():
                raise ValueError("Unexpected mixed-content XML in Matroska data")
            children.append(node(child, depth + 1))
        if children:
            result["children"] = children
        return result

    return node(root)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("chapters", "tags", "complete-chapters", "complete-tags"):
        sys.exit("Usage: p0-summarize-ebml-xml.py chapters|tags|complete-chapters|complete-tags < extracted.xml")
    payload = sys.stdin.read()
    if not payload.strip():
        raise ValueError("mkvextract yielded no XML; cannot assert metadata absent")
    root = ET.fromstring(payload)
    result = (complete_xml(root, sys.argv[1]) if sys.argv[1].startswith("complete-")
              else chapters(root) if sys.argv[1] == "chapters" else tags(root))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()

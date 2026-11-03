#!/usr/bin/env python3
"""Actual MKVToolNix fixtures for UID-role semantic preservation.

Produce a valid chapter/edition UID remap + corresponding Tag target remap
without touching compressed media, followed by a wrong-target negative and a
removed unmarked nested SimpleTag negative. Independently inspect every MKV.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET


def run(*args):
    return subprocess.check_output(list(map(str, args)), text=True, timeout=120)


def edit(*args):
    subprocess.run(list(map(str, args)), check=True, capture_output=True,
                   text=True, timeout=120)


def xml_to_file(root, filename):
    ET.ElementTree(root).write(filename, encoding="utf-8", xml_declaration=True)


def target_tag(name, value, key, uid, nested=False):
    tag = ET.Element("Tag")
    targets = ET.SubElement(tag, "Targets")
    ET.SubElement(targets, "TargetTypeValue").text = {
        "TrackUID": "30", "ChapterUID": "30", "EditionUID": "50",
        "AttachmentUID": "20"
    }[key]
    ET.SubElement(targets, key).text = str(uid)
    simple = ET.SubElement(tag, "Simple")
    ET.SubElement(simple, "Name").text = name
    ET.SubElement(simple, "String").text = value
    if nested:
        child = ET.SubElement(simple, "Simple")
        ET.SubElement(child, "Name").text = "COMMENT"
        ET.SubElement(child, "String").text = "Nested user metadata"
    return tag


def make_tags(track_uid, attach_uid, edition_uid, chapter_uid, nested=True):
    root = ET.Element("Tags")
    root.append(target_tag("DIRECTOR", "A normal Chapter target", "ChapterUID", chapter_uid, nested))
    root.append(target_tag("EDITION_NOTES", "Alternative", "EditionUID", edition_uid))
    root.append(target_tag("TRACK_NOTE", "Video source", "TrackUID", track_uid))
    root.append(target_tag("ATTACHMENT_NOTE", "Keep real payload", "AttachmentUID", attach_uid))
    return root


def checked_compare(source, target, dest):
    result = subprocess.run(
        [sys.executable, "scripts/p1-uid-role-oracle.py", str(source), str(target), str(dest)],
        capture_output=True, text=True, timeout=150)
    if result.returncode not in (0, 2, 3):
        raise RuntimeError("Unhandled oracle exit: " + result.stderr)
    document = json.loads(dest.read_text(encoding="utf-8"))
    return result.returncode, document


def main():
    fixture_dir = Path(sys.argv[1] if len(sys.argv) > 1 else
                       ".e2e/fixtures").resolve()
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else
                   ".e2e/output").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    original = fixture_dir / "p0-independent-mkvtoolnix.mkv"
    source = out_dir / "p1-uid-role-source.mkv"
    positive = out_dir / "p1-uid-role-remapped.mkv"
    wrong = out_dir / "p1-uid-role-wrong-chapter.mkv"
    missing = out_dir / "p1-uid-role-missing-nested-tag.mkv"
    chapter_xml = out_dir / "p1-uid-role-remapped-chapters.xml"
    source_tag_xml = out_dir / "p1-uid-role-source-tags.xml"
    remapped_tag_xml = out_dir / "p1-uid-role-remapped-tags.xml"
    wrong_tag_xml = out_dir / "p1-uid-role-wrong-tags.xml"
    missing_tag_xml = out_dir / "p1-uid-role-missing-tags.xml"
    evidence = out_dir / "p1-uid-role-real-audit.json"
    if not original.is_file():
        raise RuntimeError("Independent mkvmerge fixture is missing: " + str(original))
    shutil.copyfile(original, source)

    native = json.loads(run("mkvmerge", "-J", source))
    videos = [t for t in native.get("tracks", []) if t.get("type") == "video"]
    attachments = native.get("attachments", [])
    if len(videos) != 1 or not attachments:
        raise RuntimeError("Expected real video and attachment for UID test")
    track_uid = videos[0]["properties"]["uid"]
    attach_uid = attachments[0]["properties"]["uid"]
    if not isinstance(track_uid, int) or not isinstance(attach_uid, int):
        raise RuntimeError("Source lacks exact native UID types")

    real_chapters = out_dir / "p1-uid-role-original-chapters.xml"
    edit("mkvextract", source, "chapters", real_chapters)
    chapters = ET.parse(real_chapters).getroot()
    edition = chapters.find("./EditionEntry")
    parent = chapters.find("./EditionEntry/ChapterAtom")
    nested = chapters.find("./EditionEntry/ChapterAtom/ChapterAtom")
    if edition is None or parent is None or nested is None:
        raise RuntimeError("Actual fixture has no Edition / nested Chapter tree")
    edition_uid = edition.findtext("EditionUID")
    parent_uid = parent.findtext("ChapterUID")
    nested_uid = nested.findtext("ChapterUID")
    if [edition_uid, parent_uid, nested_uid] != ["510001", "510010", "510011"]:
        raise RuntimeError("Unexpected independent fixture UID identity")

    source_tags = make_tags(track_uid, attach_uid, edition_uid, nested_uid)
    xml_to_file(source_tags, source_tag_xml)
    edit("mkvpropedit", source, "--tags", "all:" + str(source_tag_xml))

    shutil.copyfile(source, positive)
    for element in chapters.iter():
        if element.tag in ("EditionUID", "ChapterUID"):
            element.text = str(int(element.text.strip()) + 100000)
    remapped_edition = str(int(edition_uid) + 100000)
    remapped_parent = str(int(parent_uid) + 100000)
    remapped_nested = str(int(nested_uid) + 100000)
    xml_to_file(chapters, chapter_xml)
    remapped_tags = make_tags(track_uid, attach_uid, remapped_edition, remapped_nested)
    xml_to_file(remapped_tags, remapped_tag_xml)
    edit("mkvpropedit", positive, "--chapters", chapter_xml)
    edit("mkvpropedit", positive, "--tags", "all:" + str(remapped_tag_xml))

    shutil.copyfile(positive, wrong)
    xml_to_file(make_tags(track_uid, attach_uid, remapped_edition, remapped_parent),
                wrong_tag_xml)
    edit("mkvpropedit", wrong, "--tags", "all:" + str(wrong_tag_xml))

    shutil.copyfile(positive, missing)
    xml_to_file(make_tags(track_uid, attach_uid, remapped_edition, remapped_nested, False),
                missing_tag_xml)
    edit("mkvpropedit", missing, "--tags", "all:" + str(missing_tag_xml))

    # Prove that the native writer really changed on-disk UIDs/targets.
    # A test that passes on unmodified copied files is not a UID-remap test.
    def actual_xml(file, kind, label):
        result = out_dir / ("p1-uid-role-" + label + "-" + kind + ".xml")
        edit("mkvextract", file, kind, result)
        return ET.parse(result).getroot()

    actual_chapters = actual_xml(positive, "chapters", "remapped")
    if [
        actual_chapters.findtext("./EditionEntry/EditionUID"),
        actual_chapters.findtext("./EditionEntry/ChapterAtom/ChapterUID"),
        actual_chapters.findtext("./EditionEntry/ChapterAtom/ChapterAtom/ChapterUID"),
    ] != [remapped_edition, remapped_parent, remapped_nested]:
        raise AssertionError("Actual native remux did not preserve authored UID remap")

    def director_tag(root):
        for tag in root.findall("Tag"):
            s = tag.find("Simple")
            if s is not None and s.findtext("Name") == "DIRECTOR":
                return tag
        raise AssertionError("Native MKV missing unmarked DIRECTOR Tag")

    remapped_director = director_tag(actual_xml(positive, "tags", "remapped"))
    wrong_director = director_tag(actual_xml(wrong, "tags", "wrong"))
    missing_director = director_tag(actual_xml(missing, "tags", "missing"))
    if remapped_director.findtext("./Targets/ChapterUID") != remapped_nested:
        raise AssertionError("Actual positive Tag target does not use new nested ChapterUID")
    if wrong_director.findtext("./Targets/ChapterUID") != remapped_parent:
        raise AssertionError("Actual negative Tag target did not switch to parent ChapterUID")
    if not remapped_director.findall("./Simple/Simple"):
        raise AssertionError("Actual positive MKV has no nested SimpleTag")
    if missing_director.findall("./Simple/Simple"):
        raise AssertionError("Actual negative MKV still contains removed nested SimpleTag")

    results = {}
    for label, output in [("remapped", positive), ("wrongChapter", wrong),
                          ("missingNested", missing)]:
        code, report = checked_compare(source, output,
                                       out_dir / ("p1-uid-role-" + label + "-result.json"))
        results[label] = {"exitCode": code, "status": report["status"],
                          "differenceFields": [x["field"] for x in report.get("differences", [])]}
    if results["remapped"]["exitCode"] != 0 or results["remapped"]["status"] != "SCOPED_RELATIONS_MATCH":
        raise AssertionError("Legitimate EditionUID / ChapterUID remap was falsely rejected: " +
                             json.dumps(results["remapped"]))
    for label in ("wrongChapter", "missingNested"):
        if results[label]["exitCode"] != 2 or "tags" not in results[label]["differenceFields"]:
            raise AssertionError("Real source Tag corruption not detected: " +
                                 json.dumps(results[label]))

    summary = {
        "schema": "p1-uid-role-real-matroska-v1",
        "verdict": "PASS",
        "source": str(source), "remapped": str(positive),
        "wrongChapter": str(wrong), "missingNested": str(missing),
        "native": {
            "mkvmerge": run("mkvmerge", "--version").strip(),
            "mkvpropedit": run("mkvpropedit", "--version").strip(),
            "mkvextract": run("mkvextract", "--version").strip(),
        },
        "originalUid": {"track": str(track_uid), "attachment": str(attach_uid),
                        "edition": edition_uid, "parent": parent_uid, "nested": nested_uid},
        "remappedUid": {"edition": remapped_edition, "parent": remapped_parent,
                        "nested": remapped_nested},
        "results": results,
        "limitations": [
            "This native fixture proves scoped UID role comparison, not a production browser writer.",
            "Two tracks with same codec and order are only positionally identified, not packet-verified.",
            "Unknown EBML, playback, user disk persistence are not certified.",
        ],
    }
    evidence.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    print("P1 actual MKV UID remap and wrong-target controls: PASS")
    print("P1 receipt: " + str(evidence))


if __name__ == "__main__":
    main()

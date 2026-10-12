#!/usr/bin/env python3
"""Independent P0 semantic oracle for MKV TrackUID-targeted test markers.

Uses mkvmerge -J and mkvextract tags; never asks the producing FFmpeg backend
whether its own output is correct. UID numbers may legally change on remux.
The meaningful check is: does P0_TRACK_RELATION still identify the same
logical video track by type and codec in the destination container?
This is a narrow test of fixture-controlled P0_* tags, NOT a full EBML audit.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


def extract_tags(file, temp):
    output = str(Path(temp) / "tags.xml")
    subprocess.run(["mkvextract", str(file), "tags", output], check=True,
                   capture_output=True, text=True, timeout=60)
    if not os.path.exists(output):
        raise ValueError("mkvextract produced no tags XML; cannot verify tag absence")
    return Path(output).read_text(encoding="utf-8-sig")


def track_projection(doc):
    results = []
    for index, item in enumerate(doc.get("tracks") or []):
        uid = (item.get("properties") or {}).get("uid")
        if uid is None:
            raise ValueError("mkvmerge omitted a track UID")
        results.append({
            "uid": str(uid),
            "kind": str(item.get("type") or ""),
            "codec": str(item.get("codec") or ""),
            "index": index,
        })
    return results


def marker_projection(tracks, tags_xml):
    roots = ET.fromstring(tags_xml)
    by_uid = {item["uid"]: item for item in tracks}
    if len(by_uid) != len(tracks):
        raise ValueError("ambiguous duplicate TrackUIDs")
    projected = []
    for tag in roots.findall(".//Tag"):
        target = tag.find("Targets")
        track_uid = None if target is None else target.findtext("TrackUID")
        for simple in tag.findall("Simple"):
            name = (simple.findtext("Name") or "").strip()
            if not name.startswith("P0_"):
                continue
            value = (simple.findtext("String") or "").strip()
            target_uid = (track_uid or "").strip()
            resolved = by_uid.get(target_uid) if target_uid else None
            target_role = (
                {"kind": resolved["kind"], "codec": resolved["codec"],
                 "ordinal": sum(
                     1 for prev in tracks[:resolved["index"]]
                     if prev["kind"] == resolved["kind"]
                     and prev["codec"] == resolved["codec"])}
                if resolved else None
            )
            projected.append({
                "name": name, "value": value,
                "target": target_role,
                "unresolvedTrackUID": target_uid if target_uid and not resolved else "",
                "untargeted": not target_uid,
            })
    return sorted(projected, key=lambda x: (x["name"], x["value"],
                                              json.dumps(x["target"], sort_keys=True)))


def inspect(path):
    parsed = json.loads(subprocess.check_output(
        ["mkvmerge", "-J", str(path)], text=True, timeout=60))
    tracks = track_projection(parsed)
    with tempfile.TemporaryDirectory(prefix="p0-track-tag-") as directory:
        tags = marker_projection(tracks, extract_tags(path, directory))
    return {"tracks": tracks, "markers": tags}


def check(source, output):
    src, dst = inspect(source), inspect(output)
    src_markers = src["markers"]
    expected = [m for m in src_markers if m["name"] == "P0_TRACK_RELATION"]
    if len(expected) != 1 or expected[0]["target"] is None or (
        expected[0]["target"]["kind"] != "video"
    ):
        raise ValueError("Source fixture lacks exactly one correctly video-targeted "
                         "P0_TRACK_RELATION marker")
    differences = []
    if src_markers != dst["markers"]:
        differences.append({
            "field": "p0TrackTagRelations",
            "source": src_markers,
            "output": dst["markers"],
        })
    return {
        "schemaVersion": 1,
        "source": str(source),
        "output": str(output),
        "outcome": "DIFFERENCE_DETECTED" if differences else "CHECKED_RELATIONS_MATCH",
        "differences": differences,
        "sourceTracks": src["tracks"],
        "outputTracks": dst["tracks"],
        "coverage": "Only fixture-marked P0_* Tag value and logical track linkage",
        "notChecked": [
            "All non-P0 Tags, chapters, attachments, entire EBML preservation",
            "Media packets, timestamps, rendering and external player compatibility",
        ],
        "caution": "Matching the checked track relation is not a general preservation guarantee.",
    }


def selftest():
    one = [{"uid": "9223372036854775807", "kind": "video",
            "codec": "V_MPEG4/ISO/AVC", "index": 0}]
    other = [{"uid": "1234567890123456789", "kind": "video",
              "codec": "V_MPEG4/ISO/AVC", "index": 0}]
    def xml(uid):
        return ("<Tags><Tag><Targets><TrackUID>" + uid +
                "</TrackUID></Targets><Simple><Name>P0_TRACK_RELATION</Name>"
                "<String>only-video</String></Simple></Tag></Tags>")
    original = marker_projection(one, xml(one[0]["uid"]))
    assert original == marker_projection(other, xml(other[0]["uid"])), (
        "reassigned UID on same semantic target must not be a false positive")
    missing = marker_projection(other, "<Tags />")
    assert original != missing, "dropped tag must be detected"
    wrong = marker_projection(other, xml("321"))
    assert original != wrong and wrong[0]["target"] is None, (
        "dangling target UID must be detected")
    print("P0 track tag semantic oracle self-test PASS")


def main():
    if sys.argv[1:] == ["--selftest"]:
        selftest()
        return
    if len(sys.argv) != 4:
        raise SystemExit("Usage: p0-audit-track-tag-relations.py SOURCE.mkv "
                         "OUTPUT.mkv REPORT.json")
    source, output, report = sys.argv[1:]
    exit_code = 0
    try:
        data = check(source, output)
        if data["differences"]:
            exit_code = 2
    except (Exception) as exc:
        data = {
            "schemaVersion": 1, "source": source, "output": output,
            "outcome": "CHECK_UNAVAILABLE", "error": str(exc),
        }
        exit_code = 3
    Path(report).parent.mkdir(parents=True, exist_ok=True)
    Path(report).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")
    print("P0 track-tag semantic relation: " + data["outcome"])
    print("P0 report: " + report)
    if data.get("differences"):
        print(json.dumps(data["differences"], ensure_ascii=False, indent=2))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

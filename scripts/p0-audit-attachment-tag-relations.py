#!/usr/bin/env python3
"""P0 independent Matroska AttachmentUID-to-payload relation audit.

Compares only the fixture's P0_ATTACHMENT_RELATION marker, its target attachment
name/type, and the SHA-256 of independently extracted attachment bytes.
Raw numeric AttachmentUIDs may be legitimately renumbered during remux.
This is NOT a general Matroska/EBML preservation certificate.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


def attachment_projection(identification, source, temp):
    attachments = []
    by_uid = {}
    for index, item in enumerate(identification.get("attachments") or []):
        uid = (item.get("properties") or {}).get("uid")
        if not isinstance(uid, int) or uid <= 0:
            raise ValueError("mkvmerge omitted a positive attachment UID")
        key = str(uid)
        if key in by_uid:
            raise ValueError("duplicate AttachmentUID")
        file_id = item.get("id")
        if not isinstance(file_id, int):
            raise ValueError("mkvmerge omitted attachment extraction ID")
        target = Path(temp) / ("attachment-%d.bin" % index)
        subprocess.run(["mkvextract", str(source), "attachments",
                        "%d:%s" % (file_id, target)], check=True,
                       capture_output=True, text=True, timeout=60)
        if not target.is_file():
            raise ValueError("attachment extraction did not create an output")
        actual = target.read_bytes()
        if int(item.get("size", -1)) != len(actual):
            raise ValueError("mkvmerge attachment size disagrees with extracted bytes")
        role = {
            "filename": str(item.get("file_name") or ""),
            "mimeType": str(item.get("content_type") or ""),
            "size": len(actual),
            "sha256": hashlib.sha256(actual).hexdigest(),
        }
        attachments.append(role)
        by_uid[key] = role
    return attachments, by_uid


def tag_projection(xml, by_uid):
    root = ET.fromstring(xml)
    markers = []
    for tag in root.findall(".//Tag"):
        targets = tag.find("Targets")
        uid = (targets.findtext("AttachmentUID") or "").strip() if targets is not None else ""
        for simple in tag.findall(".//Simple"):
            name = (simple.findtext("Name") or "").strip()
            if not name.startswith("P0_"):
                continue
            target = by_uid.get(uid) if uid else None
            markers.append({
                "name": name,
                "value": (simple.findtext("String") or "").strip(),
                "target": target,
                "unresolvedAttachmentUID": uid if uid and not target else "",
                "untargeted": not bool(uid),
            })
    return sorted(markers, key=lambda m: (m["name"], m["value"],
                                          json.dumps(m["target"], sort_keys=True)))


def inspect(source):
    data = json.loads(subprocess.check_output(
        ["mkvmerge", "-J", str(source)], text=True, timeout=60))
    with tempfile.TemporaryDirectory(prefix="p0-attachment-tag-") as temp:
        attachments, by_uid = attachment_projection(data, source, temp)
        xml_path = Path(temp) / "tags.xml"
        subprocess.run(["mkvextract", str(source), "tags", str(xml_path)],
                       check=True, capture_output=True, text=True, timeout=60)
        # A successful extraction with no Tags element may produce no file
        # on some MKVToolNix versions: semantic absence, not tool unavailability.
        xml = xml_path.read_text(encoding="utf-8-sig") if xml_path.exists() else "<Tags/>"
        markers = tag_projection(xml, by_uid)
    return {"attachments": attachments, "markers": markers}


def check(source, output):
    before, after = inspect(source), inspect(output)
    expected = [m for m in before["markers"] if m["name"] == "P0_ATTACHMENT_RELATION"]
    if len(expected) != 1 or expected[0]["target"] is None:
        raise ValueError("source lacks exactly one resolved P0_ATTACHMENT_RELATION")
    identity = expected[0]["target"]
    if identity["filename"] != "p0-attachment-evidence.bin":
        raise ValueError("source marker does not target evidence attachment")
    decoys = [a for a in before["attachments"]
              if a["filename"] == "p0-attachment-decoy.txt"]
    if len(decoys) != 1 or len(before["attachments"]) != 2:
        raise ValueError("source fixture needs precisely two distinct attachments")
    if decoys[0]["sha256"] == identity["sha256"]:
        raise ValueError("source decoy is not bytewise distinct")
    differences = []
    if before["markers"] != after["markers"]:
        differences.append({
            "field": "p0AttachmentTagRelations",
            "source": before["markers"],
            "output": after["markers"],
        })
    return {
        "schemaVersion": 1,
        "source": str(source),
        "output": str(output),
        "outcome": "DIFFERENCE_DETECTED" if differences else "CHECKED_RELATIONS_MATCH",
        "differences": differences,
        "sourceAttachments": before["attachments"],
        "outputAttachments": after["attachments"],
        "checked": [
            "P0_* marker values and resolved target AttachmentUID relationship",
            "Independently extracted target attachment name, MIME, size, SHA-256",
        ],
        "notChecked": [
            "Other Tags/Targets, chapter hierarchy, unknown EBML and UID graph",
            "Media packets, timestamps, subtitle rendering or player compatibility",
        ],
        "caution": "Matching this single attachment relation does not imply full MKV preservation.",
    }


def selftest():
    evidence = {"filename": "p0-attachment-evidence.bin", "mimeType":
                "application/octet-stream", "size": 4, "sha256": "AAAA"}
    decoy = {"filename": "p0-attachment-decoy.txt", "mimeType":
             "text/plain", "size": 5, "sha256": "BBBB"}
    def xml(uid):
        return ("<Tags><Tag><Targets><AttachmentUID>" + uid +
                "</AttachmentUID></Targets><Simple><Name>P0_ATTACHMENT_RELATION</Name>"
                "<String>evidence-not-decoy</String></Simple></Tag></Tags>")
    source = tag_projection(xml("9223372036854775807"), {
        "9223372036854775807": evidence, "33": decoy})
    renumbered = tag_projection(xml("1234567890123456789"), {
        "1234567890123456789": evidence, "34": decoy})
    assert source == renumbered, "legal UID renumber must not be considered loss"
    assert source != tag_projection("<Tags/>", {}), "lost tag must be detected"
    wrong = tag_projection(xml("34"), {"1234567890123456789": evidence, "34": decoy})
    assert wrong != source, "targeting the decoy must be detected"
    dangling = tag_projection(xml("22"), {"1234567890123456789": evidence})
    assert dangling != source and dangling[0]["unresolvedAttachmentUID"] == "22"
    changed = dict(evidence, sha256="CHANGED")
    assert source != tag_projection(xml("1234567890123456789"),
                                    {"1234567890123456789": changed})
    print("P0 attachment tag semantic oracle self-test PASS")


def main():
    if sys.argv[1:] == ["--selftest"]:
        selftest()
        return
    if len(sys.argv) != 4:
        raise SystemExit("Usage: p0-audit-attachment-tag-relations.py "
                         "SOURCE.mkv OUTPUT.mkv REPORT.json")
    source, output, report = sys.argv[1:]
    code = 0
    try:
        result = check(source, output)
        if result["differences"]:
            code = 2
    except Exception as error:
        result = {"schemaVersion": 1, "source": source, "output": output,
                  "outcome": "CHECK_UNAVAILABLE", "error": str(error)}
        code = 3
    Path(report).parent.mkdir(parents=True, exist_ok=True)
    Path(report).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")
    print("P0 attachment tag semantic relation: " + result["outcome"])
    print("P0 report: " + report)
    if result.get("differences"):
        print(json.dumps(result["differences"], ensure_ascii=False, indent=2))
    sys.exit(code)


if __name__ == "__main__":
    main()

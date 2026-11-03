#!/usr/bin/env python3
"""Independent semantic audit of *actual browser-produced* Matroska output.

Compares known source track/chapters/tag UID relationships and media packets
while allowing ONLY explicitly declared added attachments. Uses native
mkvmerge/mkvextract/ffprobe in CI; never changes browser runtime permissions.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

MOD = Path(__file__).with_name("p1-uid-role-oracle.py")
SPEC = importlib.util.spec_from_file_location("p1_uid_role_oracle", MOD)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("P1 independent native oracle cannot be loaded")
UID = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(UID)
SCHEMA = "softmux-p1-declared-attachment-additions-v1"
HEX = re.compile(r"^[0-9a-f]{64}$")


def sha256_file(path):
    hasher = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def manifest_schema(manifest):
    if not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA:
        raise UID.CannotVerify("Expected-additions manifest schema missing or wrong")
    if set(manifest) != {"schema", "sourceSha256", "outputSha256", "additions"}:
        raise UID.CannotVerify("Manifest contains missing or unrecognized fields")
    for key in ("sourceSha256", "outputSha256"):
        if not isinstance(manifest[key], str) or not HEX.fullmatch(manifest[key]):
            raise UID.CannotVerify("Invalid " + key)
    additions = manifest["additions"]
    if not isinstance(additions, list) or not additions or len(additions) > 8:
        raise UID.CannotVerify("Expected 1–8 explicitly declared attachment additions")
    known = set()
    result = []
    for addition in additions:
        if not isinstance(addition, dict) or set(addition) != {"name", "mime", "sha256"}:
            raise UID.CannotVerify("Invalid declared addition fields")
        if any(not isinstance(addition[k], str) or not addition[k] for k in
               ("name", "mime", "sha256")):
            raise UID.CannotVerify("Empty or invalid addition identity")
        if not HEX.fullmatch(addition["sha256"]):
            raise UID.CannotVerify("Invalid declared attachment hash")
        identity = (addition["name"], addition["mime"], addition["sha256"])
        if identity in known:
            raise UID.CannotVerify("Duplicate declared attachment identity")
        known.add(identity)
        result.append(addition)
    return sorted(result, key=lambda x: (x["name"], x["mime"], x["sha256"]))


def packet_facts(path):
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_packets", "-show_data_hash",
         "sha256", "-of", "json", str(path)],
        capture_output=True, text=True, timeout=120, check=True,
    )
    data = json.loads(proc.stdout)
    if not isinstance(data.get("packets"), list):
        raise UID.CannotVerify("Independent ffprobe omitted packets")
    # This is deliberately scoped to bounded CI samples, not large files.
    return [{
        "stream_index": p.get("stream_index"), "pts": p.get("pts"),
        "dts": p.get("dts"), "duration": p.get("duration"),
        "size": p.get("size"), "data_hash": p.get("data_hash"),
    } for p in data["packets"]]


def compare_declared(source_facts, output_facts, declared, source_packets, output_packets):
    differences = []
    for field in ("tracks", "chapters", "tags"):
        if source_facts[field] != output_facts[field]:
            differences.append({"field": field, "code": "UNREQUESTED_SEMANTIC_DIFFERENCE"})
    before = source_facts["attachments"]
    after = output_facts["attachments"]
    expected = sorted(before + declared, key=lambda a: (a["name"], a["mime"], a["sha256"]))
    if after != expected:
        differences.append({
            "field": "attachments",
            "code": "ATTACHMENTS_DIFFER_FROM_DECLARED_INTENT",
            "expected": expected, "observed": after,
        })
    if source_packets != output_packets:
        differences.append({"field": "packetPayloadAndTiming", "code": "MEDIA_PACKET_DIFFERENCE",
                            "sourceCount": len(source_packets), "outputCount": len(output_packets)})
    return differences


def run(source, output, expected_file):
    source, output = Path(source), Path(output)
    manifest = json.loads(Path(expected_file).read_text(encoding="utf8"))
    additions = manifest_schema(manifest)
    if not source.is_file() or not output.is_file():
        raise UID.CannotVerify("Required actual MKV file absent")
    source_hash = sha256_file(source)
    output_hash = sha256_file(output)
    if source_hash != manifest["sourceSha256"] or output_hash != manifest["outputSha256"]:
        raise UID.CannotVerify("Selected exact source/output bytes differ from intent manifest")
    source_facts = UID.inspect(source)
    output_facts = UID.inspect(output)
    before_packets, after_packets = packet_facts(source), packet_facts(output)
    differences = compare_declared(source_facts, output_facts, additions,
                                   before_packets, after_packets)
    return {
        "schema": "softmux-p1-browser-delivery-native-semantic-v1",
        "status": "DECLARED_CHANGES_AND_SCOPED_PRESERVATION_MATCH"
            if not differences else "DIFFERENCE_DETECTED",
        "source": str(source), "output": str(output),
        "sourceSha256": source_hash, "outputSha256": output_hash,
        "declaredAdditions": additions, "actualAttachments": output_facts["attachments"],
        "packetCount": len(before_packets), "differences": differences,
        "checked": [
            "exact source and browser output SHA-256 bound to independently authored expected manifest",
            "expected attachment name, MIME, and full native-extracted FileData SHA-256",
            "retained source attachment full FileData SHA-256, no other additions",
            "complete mkvextract-exported Chapter/Edition/Tag tree with logical UID roles",
            "ordered track type/codec and exact ffprobe packet data hashes/PTS/DTS/durations",
        ],
        "notChecked": [
            "unknown EBML elements not exported by mkvextract",
            "all per-track attributes and all player/rendering compatibility",
            "arbitrary new track compositions, reordered equal-codec tracks or full Matroska conformance",
            "large input performance and user's actual persisted filesystem state",
        ],
        "tools": {
            "mkvmerge": UID.run(["mkvmerge", "--version"]).strip(),
            "mkvextract": UID.run(["mkvextract", "--version"]).strip(),
            "ffprobe": UID.run(["ffprobe", "-version"]).splitlines()[0],
        },
    }


def selftest():
    original = {"tracks": [{"role": "track:0", "type": "video", "codec": "AVC"}],
                "chapters": [{"chapter": 1}], "tags": [{"target": "chapter:0"}],
                "attachments": []}
    extra = {"name": "new.bin", "mime": "application/octet-stream",
             "sha256": "b" * 64}
    actual = {**original, "attachments": [extra]}
    packets = [{"stream_index": 0, "pts": 17, "data_hash": "sha256:abc"}]
    assert compare_declared(original, actual, [extra], packets, packets) == []
    assert any(x["field"] == "attachments" for x in
               compare_declared(original, actual, [{**extra, "sha256": "a" * 64}],
                                packets, packets))
    assert any(x["field"] == "tags" for x in
               compare_declared(original, {**actual, "tags": []}, [extra], packets, packets))
    assert any(x["field"] == "packetPayloadAndTiming" for x in
               compare_declared(original, actual, [extra], packets,
                                [{**packets[0], "pts": 18}]))
    sample = {"schema": SCHEMA, "sourceSha256": "0" * 64,
              "outputSha256": "1" * 64, "additions": [extra]}
    assert manifest_schema(sample) == [extra]
    for malformed in ({**sample, "additions": []},
                      {**sample, "additions": [extra, extra]},
                      {**sample, "additions": [{**extra, "sha256": "not a hash"}]},
                      {**sample, "unknownField": True}):
        try:
            manifest_schema(malformed)
            raise AssertionError("Malformed intent was accepted")
        except UID.CannotVerify:
            pass
    print("P1 actual browser delivery declared-delta oracle selftest: PASS")


def main():
    if sys.argv[1:] == ["--selftest"]:
        selftest()
        return
    if len(sys.argv) != 5:
        sys.exit("Usage: p1-browser-delivery-semantic-audit.py SOURCE OUTPUT EXPECTED.json REPORT.json")
    source, output, expected_file, report_path = sys.argv[1:]
    code = 0
    try:
        result = run(source, output, expected_file)
        code = 0 if not result["differences"] else 2
    except Exception as exc:
        result = {"schema": "softmux-p1-browser-delivery-native-semantic-v1",
                  "status": "CHECK_UNAVAILABLE", "error": str(exc),
                  "source": source, "output": output, "expectedManifest": expected_file}
        code = 3
    Path(report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_path).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                                 encoding="utf8")
    print("P1 browser deliverable independent verdict: " + result["status"])
    print("P1 receipt: " + report_path)
    sys.exit(code)


if __name__ == "__main__":
    main()

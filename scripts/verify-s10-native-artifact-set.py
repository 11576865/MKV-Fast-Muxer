#!/usr/bin/env python3
"""Fail CI unless all twenty actual MKV bytes and matching reports are present.

This verifies the on-disk artifact set that actions/upload-artifact will take,
not only the browser test's in-memory or JSON success claim. It does not assert
physical user-device persistence or expand the S10 source diversity matrix.
"""
import argparse
import hashlib
import json
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(folder, mode):
    assert folder.is_dir(), f"ARTIFACT_DIR_MISSING:{folder}"
    name = ("softmux-s10-twenty-real-mkvs-evidence.json" if mode == "batch20"
            else "s10-combined-recovery-evidence.json")
    evidence = json.loads((folder / name).read_text(encoding="utf-8"))
    assert evidence["status"] == "PASS", "MANIFEST_NOT_PASS"
    assert evidence["verifiedJobs"] == 20, "WRONG_VERIFIED_JOB_COUNT"
    rows = evidence["files"]
    assert len(rows) == 20, "WRONG_MANIFEST_ROW_COUNT"
    expected_names = {}
    job_ids = set()
    for row in rows:
        target = row["outputName"]
        assert target == Path(target).name, "UNSAFE_OUTPUT_PATH"
        assert target.lower().endswith(".mkv"), "NOT_MATROSKA_OUTPUT"
        assert target not in expected_names, "DUPLICATE_OUTPUT_NAME"
        job_id = row["jobId"]
        assert job_id not in job_ids, "DUPLICATE_JOB_ID"
        job_ids.add(job_id)
        output = folder / target
        report = folder / (target[:-4] + ".mux-report.json")
        assert output.is_file() and report.is_file(), f"UNARCHIVED_PAIR:{target}"
        record = json.loads(report.read_text(encoding="utf-8"))
        expected_sha = row["mkvSha256"] if mode == "batch20" else row["sha256"]
        actual_sha = digest(output)
        assert actual_sha == expected_sha, f"MANIFEST_SHA_MISMATCH:{target}"
        assert record["output"]["sha256"] == actual_sha, f"REPORT_SHA_MISMATCH:{target}"
        assert record["plan"]["jobId"] == job_id, f"JOB_ID_DRIFT:{target}"
        assert record["plan"]["outputName"] == target, f"OUTPUT_IDENTITY_DRIFT:{target}"
        assert record["audit"]["ok"] is True, f"AUDIT_NOT_PASSED:{target}"
        assert output.stat().st_size == row["bytes"], f"FILE_SIZE_MISMATCH:{target}"
        expected_names[target] = actual_sha
    all_mkvs = {p.name for p in folder.glob("*.mkv") if p.is_file()}
    all_reports = {p.name for p in folder.glob("*.mux-report.json") if p.is_file()}
    expected_reports = {name[:-4] + ".mux-report.json" for name in expected_names}
    assert all_mkvs == set(expected_names), "ARTIFACT_OUTPUT_SET_DIFFERS_FROM_MANIFEST"
    assert all_reports == expected_reports, "ARTIFACT_REPORT_SET_DIFFERS_FROM_MANIFEST"
    print(json.dumps({
        "mode": mode, "state": "EXACT_TWENTY_OUTPUT_REPORT_PAIRS_VERIFIED",
        "source": name, "count": len(expected_names),
        "bytes": sum((folder / n).stat().st_size for n in expected_names),
        "externalArtifactReadback": "required after CI download",
        "physicalUserDevicePersistence": "not_verified",
    }, ensure_ascii=False))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["batch20", "recovery"])
    p.add_argument("folder", type=Path)
    args = p.parse_args()
    verify(args.folder, args.mode)

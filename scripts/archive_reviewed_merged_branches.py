#!/usr/bin/env python3
"""One-time, fail-closed archival of specifically reviewed squash-merged PR heads.

Each deleted branch first receives a verified, permanent lightweight Git tag.
This is NOT the general branch-hygiene policy; it operates on an exact-SHA
allowlist and never guesses semantic equivalence from branch names alone.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request

REPO = "11576865/MKV-Fast-Muxer"
EXEMPT = {"main", "master", "uigs-outbox", "develop", "dev", "staging", "gh-pages"}
EXEMPT_PREFIXES = ("release/", "releases/", "hotfix/", "maintenance/", "integration/")
MANIFEST = Path(__file__).resolve().parents[1] / "docs/branch-archive-allowlist-2026-10-11.json"


class Api:
    def __init__(self, token):
        if not token:
            raise RuntimeError("GH_TOKEN is required")
        self.token = token

    def request(self, resource, *, method="GET", payload=None, missing_ok=False):
        url = "https://api.github.com" + resource
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, method=method, headers=headers, data=data)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as exc:
            if missing_ok and exc.code == 404:
                return None
            raise RuntimeError(f"GitHub {method} {resource}: HTTP {exc.code}") from exc

    def all_open_prs(self):
        result = []
        page = 1
        while True:
            batch = self.request(f"/repos/{REPO}/pulls?state=open&per_page=100&page={page}")
            if not isinstance(batch, list):
                raise RuntimeError("Open PR inventory unavailable")
            result.extend(batch)
            if len(batch) < 100:
                return result
            page += 1


def approved_identity(entry, branch_info, pr, active_prs):
    """Require the same unchanged head that GitHub recorded as merged."""
    name = entry["branch"]
    sha = entry["sha"]
    if name in EXEMPT or name.startswith(EXEMPT_PREFIXES):
        return False
    if not isinstance(branch_info, dict) or branch_info.get("protected"):
        return False
    if branch_info.get("name") != name or (branch_info.get("commit") or {}).get("sha") != sha:
        return False
    if not isinstance(pr, dict) or pr.get("state") != "closed" or not pr.get("merged_at"):
        return False
    if pr.get("merged") is not True or pr.get("number") != entry["pr"]:
        return False
    head = pr.get("head") or {}
    base = pr.get("base") or {}
    if (head.get("ref"), head.get("sha")) != (name, sha):
        return False
    if (head.get("repo") or {}).get("full_name") != REPO:
        return False
    if base.get("ref") != "main" or pr.get("merge_commit_sha") != entry["merged_sha"]:
        return False
    for active in active_prs:
        for ref in ("head", "base"):
            obj = active.get(ref) or {}
            if obj.get("ref") == name and (obj.get("repo") or {}).get("full_name") == REPO:
                return False
    return True


def validate_manifest(manifest):
    if manifest.get("schema_version") != 1 or manifest.get("repository") != REPO:
        raise RuntimeError("Unexpected archive manifest schema/repository")
    entries = manifest.get("entries")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError("Empty or invalid archive allowlist")
    names = [x["branch"] for x in entries]
    prs = [x["pr"] for x in entries]
    if len(names) != len(set(names)) or len(prs) != len(set(prs)):
        raise RuntimeError("Duplicate branch or PR in allowlist")
    for entry in entries:
        if (
            not isinstance(entry["branch"], str)
            or not isinstance(entry["pr"], int)
            or not all(isinstance(entry[k], str) and len(entry[k]) == 40
                       and all(ch in "0123456789abcdef" for ch in entry[k])
                       for k in ("sha", "merged_sha"))
        ):
            raise RuntimeError("Malformed allowlist entry")


def q(value):
    return urllib.parse.quote(value, safe="")


def is_ancestor(api, earlier, later):
    compare = api.request(f"/repos/{REPO}/compare/{q(earlier)}...{q(later)}")
    return isinstance(compare, dict) and compare.get("behind_by") == 0 and not compare.get("too_large", False)


def remote_branch_sha(api, name):
    ref = api.request(f"/repos/{REPO}/git/ref/heads/{q(name)}", missing_ok=True)
    if not isinstance(ref, dict):
        return None
    if ref.get("ref") != "refs/heads/" + name:
        raise RuntimeError("Ambiguous Git ref lookup for " + name)
    return (ref.get("object") or {}).get("sha")


def ensure_archive_tag(api, entry):
    tag = f"archives/mkv-merged-pr-{entry['pr']}"
    resource = f"/repos/{REPO}/git/ref/tags/{q(tag)}"
    existing = api.request(resource, missing_ok=True)
    if existing is None:
        api.request(f"/repos/{REPO}/git/refs", method="POST",
                    payload={"ref": "refs/tags/" + tag, "sha": entry["sha"]})
        existing = api.request(resource)
    if (existing.get("ref") != "refs/tags/" + tag
            or (existing.get("object") or {}).get("sha") != entry["sha"]):
        raise RuntimeError(f"Archive tag collision: {tag}")
    return tag


def remove_with_lease(name, sha):
    """CAS-like deletion: refuse deletion if another writer moved the head."""
    args = ["git", "push", "--porcelain",
            f"--force-with-lease=refs/heads/{name}:{sha}",
            "origin", f":refs/heads/{name}"]
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"Lease-protected delete rejected for {name}: {proc.stderr.strip()}")
    return proc.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Back up and remove approved refs")
    args = parser.parse_args()
    if os.environ.get("GITHUB_REPOSITORY") != REPO:
        raise RuntimeError("Wrong repository")
    api = Api(os.environ.get("GH_TOKEN"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    validate_manifest(manifest)

    current_main = remote_branch_sha(api, "main")
    if not current_main or not is_ancestor(api, manifest["reviewed_from_main_sha"], current_main):
        raise RuntimeError("Main diverged from the reviewed merge baseline")

    deleted = 0
    retained = 0
    failed = []
    for entry in manifest["entries"]:
        name = entry["branch"]
        try:
            branch_info = api.request(f"/repos/{REPO}/branches/{q(name)}", missing_ok=True)
            pr = api.request(f"/repos/{REPO}/pulls/{entry['pr']}")
            active = api.all_open_prs()
            if not approved_identity(entry, branch_info, pr, active):
                print(f"RETAIN {name}: branch/head/PR/active-use contract not met")
                retained += 1
                continue
            if not is_ancestor(api, entry["merged_sha"], current_main):
                print(f"RETAIN {name}: PR merge commit not in current main ancestry")
                retained += 1
                continue
            if remote_branch_sha(api, name) != entry["sha"]:
                print(f"RETAIN {name}: branch ref changed during review")
                retained += 1
                continue
            if not args.apply:
                print(f"DRY RUN {name}: eligible PR #{entry['pr']} @ {entry['sha'][:12]}")
                continue

            tag = ensure_archive_tag(api, entry)
            # All write-side checks are repeated after the archive is durable.
            if remote_branch_sha(api, name) != entry["sha"]:
                print(f"RETAIN {name}: changed after archiving")
                retained += 1
                continue
            if not approved_identity(
                entry,
                api.request(f"/repos/{REPO}/branches/{q(name)}", missing_ok=True),
                api.request(f"/repos/{REPO}/pulls/{entry['pr']}"),
                api.all_open_prs(),
            ):
                print(f"RETAIN {name}: safety contract changed")
                retained += 1
                continue

            print(remove_with_lease(name, entry["sha"]))
            if remote_branch_sha(api, name) is not None:
                raise RuntimeError("Deletion not confirmed: " + name)
            print(f"ARCHIVED+DELETED {name} -> refs/tags/{tag}")
            deleted += 1
        except Exception as exc:
            failed.append(f"{name}: {exc}")
            print(f"FAILED {name}: {exc}")

    print(f"SUMMARY: archived_deleted={deleted}, retained={retained}, failed={len(failed)}, apply={args.apply}")
    if failed:
        raise RuntimeError("Archive/deletion failed for: " + "; ".join(failed))


if __name__ == "__main__":
    main()

import unittest
from unittest.mock import patch
from types import SimpleNamespace

from scripts.archive_reviewed_merged_branches import (
    REPO, approved_identity, ensure_archive_tag, is_ancestor,
    remove_with_lease, validate_manifest, q,
)


def entry():
    return {"branch": "feat/finished", "sha": "a" * 40, "pr": 42, "merged_sha": "b" * 40}


def branch_info():
    return {"name": "feat/finished", "protected": False, "commit": {"sha": "a" * 40}}


def pr_info():
    return {
        "state": "closed", "merged": True, "merged_at": "2026-10-11T06:00:00Z",
        "number": 42, "merge_commit_sha": "b" * 40,
        "head": {"ref": "feat/finished", "sha": "a" * 40, "repo": {"full_name": REPO}},
        "base": {"ref": "main", "repo": {"full_name": REPO}},
    }


class ReviewerTests(unittest.TestCase):
    def test_exact_closed_same_repo_merge_is_eligible(self):
        self.assertTrue(approved_identity(entry(), branch_info(), pr_info(), []))

    def test_changed_head_or_protection_or_missing_merge_blocks(self):
        moved = branch_info()
        moved["commit"]["sha"] = "c" * 40
        self.assertFalse(approved_identity(entry(), moved, pr_info(), []))
        protected = branch_info()
        protected["protected"] = True
        self.assertFalse(approved_identity(entry(), protected, pr_info(), []))
        open_pr = pr_info()
        open_pr["state"] = "open"
        self.assertFalse(approved_identity(entry(), branch_info(), open_pr, []))
        unmerged = pr_info()
        unmerged["merged"] = False
        self.assertFalse(approved_identity(entry(), branch_info(), unmerged, []))

    def test_fork_or_pr_merge_identity_mismatch_blocks(self):
        foreign = pr_info()
        foreign["head"]["repo"]["full_name"] = "someone/other"
        self.assertFalse(approved_identity(entry(), branch_info(), foreign, []))
        unexpected = pr_info()
        unexpected["merge_commit_sha"] = "c" * 40
        self.assertFalse(approved_identity(entry(), branch_info(), unexpected, []))

    def test_new_open_pr_head_or_base_blocks_deletion(self):
        opened = {"head": {"ref": "feat/finished", "repo": {"full_name": REPO}}}
        self.assertFalse(approved_identity(entry(), branch_info(), pr_info(), [opened]))
        opened = {"base": {"ref": "feat/finished", "repo": {"full_name": REPO}}}
        self.assertFalse(approved_identity(entry(), branch_info(), pr_info(), [opened]))

    def test_preserved_branch_classes_are_not_allowed(self):
        for name in ("main", "uigs-outbox", "release/v2", "maintenance/hold", "integration/new"):
            item = entry()
            item["branch"] = name
            state = branch_info()
            state["name"] = name
            self.assertFalse(approved_identity(item, state, pr_info(), []))

    def test_manifest_rejects_duplicate_names_prs_and_invalid_sha(self):
        record = {"schema_version": 1, "repository": REPO, "entries": [entry()]}
        validate_manifest(record)
        with self.assertRaises(RuntimeError):
            validate_manifest({**record, "entries": [entry(), entry()]})
        altered = entry()
        altered["sha"] = "invalid"
        with self.assertRaises(RuntimeError):
            validate_manifest({**record, "entries": [altered]})

    def test_git_ref_paths_retain_slash_components(self):
        self.assertEqual(q("feature/multi-font"), "feature/multi-font")
        self.assertEqual(q("feature/space name"), "feature/space%20name")

    def test_merge_commit_must_be_ancestor_of_main(self):
        class FakeApi:
            def __init__(self, behind, too_large=False):
                self.behind = behind
                self.too_large = too_large

            def request(self, _):
                return {"behind_by": self.behind, "too_large": self.too_large}

        self.assertTrue(is_ancestor(FakeApi(0), "b" * 40, "a" * 40))
        self.assertFalse(is_ancestor(FakeApi(1), "b" * 40, "a" * 40))
        self.assertFalse(is_ancestor(FakeApi(0, True), "b" * 40, "a" * 40))

    def test_existing_archive_must_point_at_exact_original_sha(self):
        class FakeApi:
            def request(self, resource, **_):
                return {"ref": "refs/tags/archives/mkv-merged-pr-42",
                        "object": {"sha": "c" * 40}}
        with self.assertRaisesRegex(RuntimeError, "collision"):
            ensure_archive_tag(FakeApi(), entry())

    @patch("scripts.archive_reviewed_merged_branches.subprocess.run")
    def test_delete_uses_expected_sha_lease(self, runner):
        runner.return_value = SimpleNamespace(returncode=0, stdout="deleted", stderr="")
        self.assertEqual(remove_with_lease("feat/finished", "a" * 40), "deleted")
        command = runner.call_args.args[0]
        self.assertIn("--force-with-lease=refs/heads/feat/finished:" + "a" * 40, command)
        self.assertEqual(command[-1], ":refs/heads/feat/finished")


if __name__ == "__main__":
    unittest.main()

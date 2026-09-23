"""Python reference implementation of the field-notes-to-crm scoring."""

from pathlib import Path

# python/src/fieldnotes/__init__.py -> parents[3] is the repo root (the
# directory containing both python/ and the TypeScript src/, data/, results/).
# Every module that reads data/notes.jsonl, results/, or .cache/ resolves
# paths against this instead of the process cwd, since `uv run` is typically
# invoked from inside python/, not from the repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]

__all__ = ["REPO_ROOT"]

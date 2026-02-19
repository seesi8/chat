import hashlib
import os
from pathlib import Path
import pathspec


def hash_directory(output_file, algorithm="sha256"):
    """
    Hash the entire current directory while:
    - Respecting .gitignore
    - Excluding the output file
    """

    root = Path.cwd()
    output_file = Path(output_file).resolve()

    hasher = hashlib.new(algorithm)

    # Load .gitignore if present
    gitignore = root / ".gitignore"
    if gitignore.exists():
        with gitignore.open("r") as f:
            spec = pathspec.PathSpec.from_lines(
                pathspec.patterns.GitWildMatchPattern,
                f
            )
    else:
        spec = pathspec.PathSpec([])

    files_to_hash = []

    for path in root.rglob("*"):
        if path.is_file():
            relative_path = path.relative_to(root)

            # Exclude output file
            if path.resolve() == output_file:
                continue

            # Respect .gitignore
            if spec.match_file(str(relative_path)):
                continue

            files_to_hash.append(relative_path)

    # Deterministic ordering
    for relative_path in sorted(files_to_hash):
        full_path = root / relative_path

        # Include file path in hash for structural integrity
        hasher.update(str(relative_path).encode())

        with full_path.open("rb") as f:
            while chunk := f.read(8192):
                hasher.update(chunk)

    digest = hasher.hexdigest()

    with open(output_file, "w") as f:
        f.write(digest)

    return digest

if __name__ == "__main__":
    hash_directory("commit.hash")
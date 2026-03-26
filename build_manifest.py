from pathlib import Path
import json
from datetime import datetime, timezone

SITE_ROOT_URL = "https://coiledlamb.neocities.org/"
OUTPUT_FILE = "manifest.json"

IGNORE_NAMES = {
    ".git",
    ".gitignore",
    "__pycache__",
    ".DS_Store",
    "Thumbs.db",
    OUTPUT_FILE,
    "build_manifest.py",
}

CATEGORY_RULES = [
    ("pages", lambda p: p.suffix in {".html", ".htm"}),
    ("styles", lambda p: p.suffix == ".css"),
    ("scripts", lambda p: p.suffix in {".js", ".mjs"}),
    ("data", lambda p: p.suffix in {".json", ".txt", ".md"}),
    ("images", lambda p: p.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"}),
    ("audio", lambda p: p.suffix.lower() in {".mp3", ".wav", ".ogg", ".m4a"}),
    ("video", lambda p: p.suffix.lower() in {".mp4", ".webm", ".mov"}),
    ("fonts", lambda p: p.suffix.lower() in {".woff", ".woff2", ".ttf", ".otf"}),
]


def should_ignore(path: Path) -> bool:
    return any(part in IGNORE_NAMES for part in path.parts)


def normalize(path: Path) -> str:
    return path.as_posix()


def categorize(path: Path) -> str:
    posix = normalize(path)

    # Folder-based special cases first
    if posix.startswith("background/"):
        return "background"
    if posix.startswith("images/"):
        return "images"
    if posix.startswith("audio/"):
        return "audio"
    if posix.startswith("video/"):
        return "video"
    if posix.startswith("fonts/"):
        return "fonts"

    # Then fallback by extension
    for category, rule in CATEGORY_RULES:
      if rule(path):
        return category

    return "other"


def collect_files(root: Path) -> list[str]:
    files = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if should_ignore(path):
            continue

        rel = path.relative_to(root)
        files.append(normalize(rel))

    files.sort()
    return files


def build_groups(files: list[str]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}

    for file_str in files:
        category = categorize(Path(file_str))
        groups.setdefault(category, []).append(file_str)

    # Sort keys for stable output
    ordered = {}
    preferred_order = [
        "pages",
        "styles",
        "scripts",
        "background",
        "data",
        "images",
        "audio",
        "video",
        "fonts",
        "other",
    ]

    for key in preferred_order:
        if key in groups:
            ordered[key] = groups[key]

    for key in sorted(groups.keys()):
        if key not in ordered:
            ordered[key] = groups[key]

    return ordered


def main() -> None:
    root = Path(".").resolve()
    files = collect_files(root)
    groups = build_groups(files)

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": SITE_ROOT_URL,
        "file_count": len(files),
        "groups": groups,
        "files": files,
    }

    output_path = root / OUTPUT_FILE
    output_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote {OUTPUT_FILE} with {len(files)} files.")


if __name__ == "__main__":
    main()
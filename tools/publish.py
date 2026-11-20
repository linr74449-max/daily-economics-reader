"""Validate dated editorial sources and atomically publish the reader catalog."""
import json
import hashlib
import os
import tempfile
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension"
TRACKS = {"微观经济学", "博弈论", "宏观与公共财政", "金融市场", "发展与国际经济", "家庭理财"}


def https(url, domains=None):
    address = urlparse(url)
    return address.scheme == "https" and address.hostname and (not domains or address.hostname in domains)


def validate(path, *, public=False):
    issue = json.loads(path.read_text(encoding="utf-8"))
    for key in ("concept", "title", "lead", "storyTitle", "story", "tableTitle", "note", "meaning", "deeperTitle", "deeper"):
        if not isinstance(issue.get(key), str) or not issue[key].strip():
            raise ValueError(f"{path.name}: missing {key}")
    if "decisionTakeaway" in issue:
        closing = issue["decisionTakeaway"]
        if not isinstance(closing, str) or not closing.strip() or len(closing) > 800:
            raise ValueError(f"{path.name}: empty or invalid decisionTakeaway")
    if date.fromisoformat(issue["date"]).isoformat() != path.stem or issue["track"] not in TRACKS:
        raise ValueError(f"{path.name}: date or learning track")
    if (not public or "figma" in issue) and not https(issue.get("figma",""), {"www.figma.com", "figma.com"}):
        raise ValueError(f"{path.name}: Figma issue URL")
    if "image" in issue:
        image = issue["image"]
        if public and image.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
            valid_image = True
        else:
            asset = (EXT / image).resolve()
            valid_image = asset.is_relative_to(EXT / "assets") and asset.is_file()
        if not valid_image or not issue.get("alt") or (not public and not https(issue["art"], {"canva.link", "www.canva.com"})):
            raise ValueError(f"{path.name}: artwork or credit")
    if len(issue["columns"]) < 2 or not issue["rows"] or any(len(r) != len(issue["columns"]) for r in issue["rows"]):
        raise ValueError(f"{path.name}: inconsistent table columns")
    if not issue["sources"] or any(not label or not https(url) for label, url in issue["sources"]):
        raise ValueError(f"{path.name}: source URL")
    if "clip" in issue:
        clip = issue["clip"]
        date.fromisoformat(clip["date"])
        if not all(clip.get(k) for k in ("type", "issuer", "title", "fact", "explain")) or not https(clip["url"]):
            raise ValueError(f"{path.name}: incomplete news clipping")
    return issue


def atomic_write(path, data):
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, encoding="utf-8", newline="\n") as out:
        out.write(data)
        staging=Path(out.name)
    try:
        os.replace(staging, path)
    finally:
        staging.unlink(missing_ok=True)


def publish():
    for path in (ROOT / "issues").glob("*.json"):
        validate(path)
    published = ROOT / "published"
    issues, index = [], []
    for path in sorted(published.glob("????-??-??.json")):
        issue = validate(path, public=True)
        raw = path.read_bytes().replace(b"\r\n", b"\n")
        sha = hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()
        index.append({**{k:issue[k] for k in ("date","title","track","concept")}, "sha":sha})
        issues.append({**issue, "_sha":sha})
    if not issues:
        raise ValueError("No issues in catalog")
    atomic_write(published / "index.json", json.dumps(index, ensure_ascii=False, indent=2)+"\n")
    atomic_write(EXT / "catalog.js", "const ISSUES = "+json.dumps(issues, ensure_ascii=False, indent=2)+";\n")
    print(f"Published {len(issues)} issues through {issues[-1]['date']}")


if __name__ == "__main__":
    publish()

"""Validate dated editorial sources and atomically publish the reader catalog."""
import json
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


def validate(path):
    issue = json.loads(path.read_text(encoding="utf-8"))
    for key in ("concept", "title", "lead", "storyTitle", "story", "tableTitle", "note", "meaning", "deeperTitle", "deeper"):
        if not isinstance(issue.get(key), str) or not issue[key].strip():
            raise ValueError(f"{path.name}: missing {key}")
    if date.fromisoformat(issue["date"]).isoformat() != path.stem or issue["track"] not in TRACKS:
        raise ValueError(f"{path.name}: date or learning track")
    if not https(issue["figma"], {"www.figma.com", "figma.com"}):
        raise ValueError(f"{path.name}: Figma issue URL")
    if "image" in issue:
        asset = (EXT / issue["image"]).resolve()
        if not asset.is_relative_to(EXT / "assets") or not asset.is_file() or not issue.get("alt") or not https(issue["art"], {"canva.link", "www.canva.com"}):
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


def publish():
    issues = [validate(path) for path in sorted((ROOT / "issues").glob("*.json"))]
    if not issues:
        raise ValueError("No issues in catalog")
    data = "const ISSUES = " + json.dumps(issues, ensure_ascii=False, indent=2) + ";\n"
    with tempfile.NamedTemporaryFile("w", dir=EXT, delete=False, encoding="utf-8") as out:
        out.write(data)
        staging = Path(out.name)
    try:
        os.replace(staging, EXT / "catalog.js")
    finally:
        staging.unlink(missing_ok=True)
    print(f"Published {len(issues)} issues through {issues[-1]['date']}")


if __name__ == "__main__":
    publish()

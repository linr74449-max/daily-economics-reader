"""Mirror immutable reader editions from the anonymous public service."""
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

from publish import ROOT, publish

FEED = "https://daily-economics-journal.lacywalrus16.chatgpt.site/published/"


def fetch(name):
    req = Request(FEED + name, headers={"User-Agent": "DailyEconomicsPublicArchive/1.1"})
    with urlopen(req, timeout=30) as response:
        data = response.read(8_000_001)
    if len(data) > 8_000_000:
        raise ValueError("Oversized publication response")
    return data


def blob_sha(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def sync():
    directory = ROOT / "published"
    directory.mkdir(exist_ok=True)
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    index = json.loads(fetch("index.json"))
    if not isinstance(index,list) or not index:
        raise ValueError("Empty public index")
    for item in index:
        day, sha = item["date"], item["sha"]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",day) or day>today or not re.fullmatch(r"[a-f0-9]{40}",sha):
            raise ValueError("Invalid public index entry")
        path = directory / (day+".json")
        if path.is_file():
            if blob_sha(path.read_bytes().replace(b"\r\n",b"\n")) != sha:
                raise ValueError(f"Stored edition differs from public revision for {day}")
            continue
        raw=fetch(day+".json?rev="+sha)
        if blob_sha(raw)!=sha or json.loads(raw)["date"]!=day:
            raise ValueError(f"Public edition failed verification for {day}")
        tmp=path.with_suffix(".tmp")
        tmp.write_bytes(raw)
        tmp.replace(path)
    publish()


if __name__=="__main__":
    sync()

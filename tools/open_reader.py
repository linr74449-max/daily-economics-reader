"""Prepare a local edition with official feeds, then open it in the default browser."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import tempfile
from urllib.request import Request, urlopen
import webbrowser
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "extension"
OUTPUT = EXT / "local-reader.html"
MARKER = '<script id="offline-feeds" type="application/json">'
FEEDS = {
    "mof": "https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/",
    "nbs": "https://www.stats.gov.cn/sj/zxfb/rss.xml",
    "uk": "https://www.gov.uk/government/organisations/hm-treasury.atom",
    "fed": "https://www.federalreserve.gov/feeds/press_monetary.xml",
}


def existing():
    if OUTPUT.exists():
        try:
            return json.loads(OUTPUT.read_text(encoding="utf-8").split(MARKER, 1)[1].split("</script>", 1)[0])
        except (IndexError, ValueError):
            pass
    return {}


def download(source, url, today, old):
    if old.get("day") == today:
        return old
    try:
        with urlopen(Request(url, headers={"User-Agent": "DailyEconomicsReader/1.0"}), timeout=10) as response:
            raw = response.read(6_000_001)
            if len(raw) > 6_000_000:
                raise ValueError("oversized feed")
            encoding = response.headers.get_content_charset() or "utf-8"
        if source == "mof":
            text = raw.decode(encoding, errors="replace")
            if "<li" not in text.lower() or "财政" not in text:
                raise ValueError("unexpected news index")
        else:
            root = ElementTree.fromstring(raw)
            if root.tag.split("}")[-1] not in {"rss","feed","RDF"}:
                raise ValueError("unexpected feed format")
            feed = ElementTree.Element("feed" if source=="uk" else "rss")
            for item in root.iter():
                kind = item.tag.split("}")[-1]
                if kind not in {"entry","item"}:
                    continue
                entry = ElementTree.SubElement(feed,kind)
                for child in item:
                    tag=child.tag.split("}")[-1]
                    if tag in {"title","link","pubDate","published","updated"}:
                        ElementTree.SubElement(entry,tag,child.attrib).text=child.text
            text = ElementTree.tostring(feed,encoding="unicode")
        return {"day":today,"raw":text}
    except (OSError, ValueError, ElementTree.ParseError, LookupError):
        return old


def prepare():
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    cache = existing()
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        jobs={k:pool.submit(download,k,url,today,cache.get(k,{})) for k,url in FEEDS.items()}
        items={k:future.result() for k,future in jobs.items()}
    data=json.dumps(items,ensure_ascii=False).replace("<","\\u003c")
    template=(EXT/"index.html").read_text(encoding="utf-8")
    html=template.replace('<script src="catalog.js">',MARKER+data+'</script>\n  <script src="catalog.js">',1)
    with tempfile.NamedTemporaryFile("w",encoding="utf-8",dir=EXT,delete=False) as out:
        out.write(html)
        staging=Path(out.name)
    try:
        staging.replace(OUTPUT)
    finally:
        staging.unlink(missing_ok=True)
    print(f"Official sources refreshed: {sum(s.get('day')==today for s in items.values())}/{len(items)}")
    return OUTPUT


if __name__=="__main__":
    path=prepare()
    if "--prepare" not in sys.argv:
        webbrowser.open(path.as_uri())

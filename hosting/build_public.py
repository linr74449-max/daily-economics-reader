"""Package the public reader without editorial sources or owner settings."""
import base64
import json
from pathlib import Path

here = Path(__file__).resolve().parent
root = here.parent
extension = root / "extension"
files = ["index.html","reader.css","reader.js","news.js","journal.js","catalog.js"]
files.extend(p.relative_to(extension).as_posix() for p in (extension / "assets").glob("*.png"))
types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".png":"image/png"}
assets = {}
for name in files:
    path = extension / name
    assets[name] = [types[path.suffix], base64.b64encode(path.read_bytes()).decode()]
target = root / ".public-site/dist/server/index.js"
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text("const ASSETS="+json.dumps(assets)+";\n"+(here/"public_worker.mjs").read_text(encoding="utf-8"),encoding="utf-8")

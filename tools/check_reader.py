"""Smoke-test the unpacked extension in a disposable Edge profile on Windows."""
import base64
import hashlib
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import requests
import websocket

ROOT = Path(__file__).resolve().parents[1]
EDGE = Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft/Edge/Application/msedge.exe"


class DevTools:
    def __init__(self, url):
        self.socket = websocket.create_connection(url, timeout=25, suppress_origin=True)
        self.serial = 0

    def call(self, method, **params):
        self.serial += 1
        self.socket.send(json.dumps(dict(id=self.serial, method=method, params=params)))
        while True:
            response = json.loads(self.socket.recv())
            if response.get("id") == self.serial:
                if "error" in response:
                    raise RuntimeError(response["error"])
                return response["result"]

    def js(self, expression):
        reply = self.call("Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in reply:
            raise RuntimeError(reply["exceptionDetails"])
        return reply["result"].get("value")


def wait(fn, timeout=18):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(.15)
    raise RuntimeError("Timed out waiting for browser")


def check():
    extension = ROOT / "extension"
    key = json.loads((extension/"manifest.json").read_text(encoding="utf-8"))["key"]
    digest = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
    extension_id = "".join(chr(97+int(c,16)) for c in digest)
    url = f"chrome-extension://{extension_id}/index.html"
    local_url = (extension/"local-reader.html").as_uri()
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        process = subprocess.Popen([str(EDGE), "--headless=new", "--disable-gpu", "--no-first-run",
            "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0",
            "--window-size=1340,880", f"--user-data-dir={profile}", f"--load-extension={extension}",
            "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        browser = None
        try:
            path = Path(profile) / "DevToolsActivePort"
            port = wait(lambda: path.exists() and path.read_text().splitlines()[0])
            endpoint = f"http://127.0.0.1:{port}"
            def targets():
                return requests.get(endpoint+"/json/list", timeout=3).json()
            browser = DevTools(requests.get(endpoint+"/json/version",timeout=3).json()["webSocketDebuggerUrl"])
            admin=browser.call("Target.createTarget",url="edge://extensions/")["targetId"]
            page=wait(lambda:next((t for t in targets() if t["id"]==admin),None))
            tab = DevTools(page["webSocketDebuggerUrl"])
            wait(lambda: tab.js("typeof chrome!=='undefined' && !!chrome.developerPrivate"))
            ids=tab.js("new Promise(r=>chrome.developerPrivate.getExtensionsInfo({},xs=>r(xs.map(x=>x.id))))")
            assert extension_id in ids
            tab.call("Page.navigate",url=url)
            wait(lambda: tab.js("!!document.querySelector('.cover-title')"))
            assert tab.js("ISSUES.length") >= 4
            assert tab.js("PolicyDesk.day('2026-11-19T16:00:00Z')") == "2026-11-20"
            assert tab.js("todayIssue('2026-11-21').concept") == "最优反应"
            assert tab.js("todayIssue('2026-11-18')") is None
            assert tab.js("todayIssue('9999-12-31').date === ISSUES.at(-1).date")
            wait(lambda: tab.js("document.querySelector('.policy-desk [role=status]')?.textContent?.includes('来源')"),timeout=18)
            print("Feeds:", tab.js("document.querySelector('.policy-desk [role=status]').textContent"))
            assert tab.js("document.querySelectorAll('.news-item').length") <= 2
            shot=tab.call("Page.captureScreenshot",format="png",captureBeyondViewport=False)
            (Path(profile)/"reader.png").write_bytes(base64.b64decode(shot["data"]))
            if os.getenv("ECON_PREVIEW_PATH"):
                Path(os.environ["ECON_PREVIEW_PATH"]).write_bytes(base64.b64decode(shot["data"]))
            for issue in tab.js("ISSUES.map(i=>i.date)"):
                tab.js(f"location.hash='issue/{issue}'")
                wait(lambda: tab.js("document.querySelector('.art-caption')?.textContent.endsWith('"+issue.replace("-",".")+"')"))
                assert tab.js("document.querySelectorAll('tbody tr').length") >= 2
            tab.js("document.querySelector('.mark').click()")
            assert tab.js("document.querySelector('.mark').ariaPressed")=="true"
            tab.call("Page.reload")
            wait(lambda: tab.js("document.querySelector('.mark')?.ariaPressed==='true'"))
            tab.js("location.hash='map'");wait(lambda: tab.js("document.querySelectorAll('.map-card').length===6"))
            tab.js("location.hash='archive'");wait(lambda: tab.js("document.querySelectorAll('.issue-line').length>=4"))
            tab.call("Emulation.setDeviceMetricsOverride",width=360,height=760,deviceScaleFactor=1,mobile=True)
            tab.js("location.hash='today'");wait(lambda: tab.js("!!document.querySelector('.cover-title')"))
            assert tab.js("document.documentElement.scrollWidth<=innerWidth")
            if (extension/"local-reader.html").exists():
                tab.call("Page.navigate",url=local_url)
                wait(lambda:tab.js("!!document.querySelector('#offline-feeds') && !!document.querySelector('.policy-desk [role=status]')"))
                print("Local edition:",tab.js("document.querySelector('.policy-desk [role=status]').textContent"))
            print("Verified extension installation, four issues, date changes, read state, archive, map, local reader and mobile width.")
        finally:
            if browser:
                try:
                    browser.call("Browser.close")
                except (websocket.WebSocketException, OSError):
                    pass
            if process.poll() is None:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    process.wait(timeout=5)


if __name__ == "__main__":
    check()

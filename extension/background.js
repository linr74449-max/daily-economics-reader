async function readingUrl() {
  const offline = chrome.runtime.getURL("index.html");
  if (!navigator.onLine) return offline;
  try {
    const settings = await fetch(chrome.runtime.getURL("owner-edition.json"));
    if (!settings.ok) return offline;
    const url = new URL((await settings.json()).url);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    // A standard installation includes only the bundled editions.
  }
  return offline;
}

chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({url: await readingUrl()});
});

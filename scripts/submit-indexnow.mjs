import { allSeoPages, SITE_URL } from "../src/content/seoCatalog.js";

const key = "8e4cf70bd1524ef4a6a9b83ed63011c5";
const keyLocation = `${SITE_URL}/${key}.txt`;
const urlList = allSeoPages.map((page) => new URL(page.path, SITE_URL).href);

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE_URL).hostname, key, keyLocation, urlList }),
});

if (!response.ok) {
  throw new Error(`IndexNow submission failed (${response.status}): ${await response.text()}`);
}

console.log(`Submitted ${urlList.length} Filzy URLs to IndexNow (${response.status}).`);

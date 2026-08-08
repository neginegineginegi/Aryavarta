import { chromium } from "playwright";
const B = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await B.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3000/?mode=union", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const range = p.locator("input.year-slider").first();
await range.scrollIntoViewIfNeeded();
const box = await range.boundingBox();
const info = await range.evaluate((el) => ({ min: +el.min, max: +el.max }));
console.log("slider:", JSON.stringify(info), "x=", box.x.toFixed(1), "w=", box.width.toFixed(1));

const clip = { x: Math.round(box.x - 20), y: Math.round(box.y - 12), width: Math.round(box.width + 40), height: 28 };
const centre = async (year) => {
  await range.evaluate((el, y) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(y));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, year);
  await p.waitForTimeout(200);
  const b64 = (await p.screenshot({ clip })).toString("base64");
  return p.evaluate(async ([data, w, h]) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], bb = d[i + 2];
      if (r > 140 && r < 225 && gg > 35 && gg < 105 && bb < 65) { sum += (i / 4) % w; n++; }
    }
    return n ? sum / n : null;
  }, [b64, clip.width, clip.height]);
};
const years = [info.min, 1965, 1984, 2000, 2017, info.max];
const out = [];
for (const y of years) {
  const cx = await centre(y);
  const abs = cx === null ? null : cx + clip.x;
  const pct = (y - info.min) / (info.max - info.min);
  const naive = box.x + pct * box.width;
  out.push({ y, pct, abs });
  console.log(`${y}: thumb=${abs?.toFixed(1)}  naive dot=${naive.toFixed(1)}  drift=${abs ? (naive - abs).toFixed(1) : "?"}px`);
}
const a = out[0], z = out[out.length - 1];
if (a.abs && z.abs) {
  const inset = a.abs - box.x, travel = z.abs - a.abs;
  console.log(`\ninset=${inset.toFixed(2)}px  travel=${travel.toFixed(2)}px  width=${box.width.toFixed(2)}  thumb=${(box.width - travel).toFixed(2)}px`);
}
await B.close();

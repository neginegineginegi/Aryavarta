"use client";

/**
 * Render an SVG chart to a PNG the reader can keep, with the source line
 * drawn INSIDE the image.
 *
 * Inside, because an exported chart's fate is to be pasted somewhere without
 * its page: the moment it leaves, a caption that lived in the DOM is gone and
 * the chart becomes an unsourced claim wearing our styling. The attribution
 * travels in the pixels or it does not travel.
 *
 * No dependencies: serialize the SVG, paint it to a canvas at 2x, add a
 * footer strip with the source text, hand back a blob. The caller triggers
 * the download; this module only draws.
 */

const SCALE = 2;
const FOOTER_H = 34; // CSS px, before scale: two lines, title then source
const PAD = 8;

export async function svgToPng(
  svg: SVGSVGElement,
  lines: { title: string; source: string },
): Promise<Blob | null> {
  const width = svg.viewBox.baseVal?.width || svg.clientWidth;
  const height = svg.viewBox.baseVal?.height || svg.clientHeight;
  if (!width || !height) return null;

  // Inline the theme colors: a serialized SVG loses the page's CSS variables,
  // and without this every var(--...) stroke goes black or vanishes.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const styles = getComputedStyle(svg);
  for (const el of [clone, ...clone.querySelectorAll<SVGElement>("*")]) {
    for (const attr of ["stroke", "fill"]) {
      const v = el.getAttribute(attr);
      if (v && v.startsWith("var(")) {
        const name = v.slice(4, -1).split(",")[0].trim();
        el.setAttribute(attr, styles.getPropertyValue(name).trim() || "currentColor");
      }
    }
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }),
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg failed to rasterise"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * SCALE;
    canvas.height = (height + FOOTER_H) * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(SCALE, SCALE);

    // Paper behind everything: a transparent PNG pasted on a dark slide would
    // silently invert the chart's contrast.
    ctx.fillStyle = styles.getPropertyValue("--color-paper").trim() || "#faf7f2";
    ctx.fillRect(0, 0, width, height + FOOTER_H);
    ctx.drawImage(img, 0, 0, width, height);

    ctx.strokeStyle = styles.getPropertyValue("--color-rule").trim() || "#ddd";
    ctx.beginPath();
    ctx.moveTo(PAD, height + 0.5);
    ctx.lineTo(width - PAD, height + 0.5);
    ctx.stroke();

    // Two lines: what the chart is, then where its numbers came from. The
    // SVG itself has no title, so a pasted export must carry its own. Each
    // line truncates with an ellipsis rather than wrapping: an attribution,
    // not a paragraph.
    ctx.font = `9px ${styles.getPropertyValue("--font-mono").trim() || "monospace"}`;
    ctx.textBaseline = "middle";
    const fit = (raw: string) => {
      let text = raw;
      while (text.length > 3 && ctx.measureText(text).width > width - PAD * 2) {
        text = text.slice(0, -4) + "…";
      }
      return text;
    };
    ctx.fillStyle = styles.getPropertyValue("--color-ink").trim() || "#222";
    ctx.fillText(fit(lines.title), PAD, height + 11);
    ctx.fillStyle = styles.getPropertyValue("--color-ink-muted").trim() || "#555";
    ctx.fillText(fit(lines.source), PAD, height + 24);

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Download helper. Separate so tests can call svgToPng without a click. */
export async function downloadSvgAsPng(
  svg: SVGSVGElement,
  lines: { title: string; source: string },
  filename: string,
): Promise<boolean> {
  const blob = await svgToPng(svg, lines);
  if (!blob) return false;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

"use client";

import { useEffect, useRef } from "react";

/**
 * The Union network: 36 state/UT records as nodes on an ellipse, each linked
 * to one central Union node. Saffron pulses travel the links inward; hovering
 * a node names it and shows when its record begins; tapping bursts pulses.
 *
 * Self-contained: own pointer listeners, rAF loop and IntersectionObserver
 * (draws only while on screen), honours prefers-reduced-motion with a single
 * static paint and no loop.
 */

const NODES: [code: string, name: string, since: number][] = [
  ["AP", "Andhra Pradesh", 1956], ["AR", "Arunachal Pradesh", 1987], ["AS", "Assam", 1947], ["BR", "Bihar", 1947],
  ["CG", "Chhattisgarh", 2000], ["GA", "Goa", 1987], ["GJ", "Gujarat", 1960], ["HR", "Haryana", 1966],
  ["HP", "Himachal Pradesh", 1971], ["JH", "Jharkhand", 2000], ["KA", "Karnataka", 1956], ["KL", "Kerala", 1956],
  ["MP", "Madhya Pradesh", 1956], ["MH", "Maharashtra", 1960], ["MN", "Manipur", 1972], ["ML", "Meghalaya", 1972],
  ["MZ", "Mizoram", 1987], ["NL", "Nagaland", 1963], ["OD", "Odisha", 1947], ["PB", "Punjab", 1947],
  ["RJ", "Rajasthan", 1949], ["SK", "Sikkim", 1975], ["TN", "Tamil Nadu", 1947], ["TS", "Telangana", 2014],
  ["TR", "Tripura", 1972], ["UP", "Uttar Pradesh", 1947], ["UK", "Uttarakhand", 2000], ["WB", "West Bengal", 1947],
  ["AN", "Andaman & Nicobar", 1956], ["CH", "Chandigarh", 1966], ["DD", "DNH & Daman-Diu", 2020], ["DL", "Delhi", 1947],
  ["JK", "Jammu & Kashmir", 1947], ["LA", "Ladakh", 2019], ["LD", "Lakshadweep", 1956], ["PY", "Puducherry", 1962],
];

const MONO = "'IBM Plex Mono', ui-monospace, monospace"; // keep in step with --font-mono

export function NetworkSection() {
  return (
    <section className="lsec-tint">
      <div className="net-head">
        <span className="lbadge">THE NETWORK</span>
        <h2 className="lh2 lh2-lg">One Union.<br />Thirty-six records.</h2>
        <p className="lsub">
          Every state and union territory keeps its own line of the record, and every line
          flows into the same archive. Hover a node to see when its record begins.
        </p>
      </div>
      <UnionNetwork />
      <div className="net-caption">28 STATES · 8 UNION TERRITORIES · 1 UNION</div>
    </section>
  );
}

export function UnionNetwork() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, vis = false, t = 0, last = 0, hover = -1, w = 0, h = 0;
    const ptr = { x: -1e4, y: -1e4, has: false };
    const pulses = Array.from({ length: 7 }, () => ({ n: Math.floor(Math.random() * NODES.length), p: Math.random() }));

    const draw = (dt: number) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1) return;
      const S = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(r.width * S), H = Math.round(r.height * S);
      if (W !== w || H !== h) { w = W; h = H; el.width = W; el.height = H; }
      t += dt;
      const motion = reduce ? 0 : 1;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2 - 8 * S;
      const wide = r.width > 580;
      const rx = W / 2 - (wide ? 66 : 26) * S, ry = H / 2 - (wide ? 52 : 28) * S;
      const px = (ptr.x - r.left) * S, py = (ptr.y - r.top) * S;
      const pos: [number, number, number][] = [];
      let hov = -1, hd = 1e9;
      for (let i = 0; i < NODES.length; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / NODES.length;
        let x = cx + Math.cos(a) * rx + Math.sin(t * 0.7 + i * 1.7) * 3 * S * motion;
        let y = cy + Math.sin(a) * ry + Math.cos(t * 0.9 + i * 2.3) * 3 * S * motion;
        if (ptr.has && motion) {
          const dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
          if (d < 150 * S && d > 1) { const k = (1 - d / (150 * S)) * 9 * S; x += (dx / d) * k; y += (dy / d) * k; }
        }
        pos.push([x, y, a]);
        const d = Math.hypot(px - x, py - y);
        if (d < 36 * S && d < hd) { hd = d; hov = i; }
      }
      if (!ptr.has) hov = -1;
      hover = hov;
      el.style.cursor = hov >= 0 ? "pointer" : "";
      for (let i = 0; i < NODES.length; i++) {
        ctx.beginPath(); ctx.moveTo(pos[i][0], pos[i][1]); ctx.lineTo(cx, cy);
        ctx.strokeStyle = i === hov ? "rgba(194,65,12,0.5)" : "rgba(26,26,24,0.08)";
        ctx.lineWidth = (i === hov ? 1.4 : 1) * S;
        ctx.stroke();
      }
      if (motion) for (const p of pulses) {
        p.p += dt * (0.3 + (p.n % 5) * 0.02);
        if (p.p >= 1) { p.p = 0; p.n = Math.floor(Math.random() * NODES.length); }
        if (p.p < 0) continue;
        const [x, y] = pos[p.n];
        const ex = x + (cx - x) * p.p, ey = y + (cy - y) * p.p;
        ctx.beginPath(); ctx.arc(ex, ey, 2.1 * S, 0, 7);
        ctx.fillStyle = `rgba(255,153,51,${(0.8 * Math.sin(p.p * Math.PI)).toFixed(3)})`;
        ctx.fill();
      }
      for (let i = 0; i < NODES.length; i++) {
        ctx.beginPath(); ctx.arc(pos[i][0], pos[i][1], (i === hov ? 5.5 : 3.1) * S, 0, 7);
        ctx.fillStyle = i === hov ? "#c2410c" : "rgba(26,26,24,0.55)";
        ctx.fill();
      }
      ctx.textBaseline = "middle";
      if (wide) {
        ctx.font = `${8.5 * S}px ${MONO}`;
        for (let i = 0; i < NODES.length; i++) {
          const [x, y, a] = pos[i], c = Math.cos(a);
          ctx.textAlign = c > 0.3 ? "left" : c < -0.3 ? "right" : "center";
          ctx.fillStyle = i === hov ? "#c2410c" : "rgba(26,26,24,0.4)";
          ctx.fillText(NODES[i][0], x + c * 15 * S, y + Math.sin(a) * 15 * S);
        }
      }
      const br = 1 + Math.sin(t * 1.3) * 0.06 * motion;
      ctx.beginPath(); ctx.arc(cx, cy, 8.5 * S * br, 0, 7); ctx.fillStyle = "#1a1a18"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 15 * S * br, 0, 7); ctx.strokeStyle = "rgba(26,26,24,0.22)"; ctx.lineWidth = S; ctx.stroke();
      ctx.font = `${9 * S}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(26,26,24,0.5)";
      ctx.fillText("THE UNION", cx, cy + 30 * S);
      if (hov >= 0) {
        const [x, y] = pos[hov], d = NODES[hov];
        const label = `${d[1].toUpperCase()} · RECORDS SINCE ${d[2]}`;
        ctx.font = `${10 * S}px ${MONO}`;
        const tw = ctx.measureText(label).width + 26 * S, th = 30 * S;
        const bx = Math.min(Math.max(x - tw / 2, 6 * S), W - tw - 6 * S);
        let by = y - th - 15 * S; if (by < 6 * S) by = y + 15 * S;
        ctx.beginPath();
        if ("roundRect" in ctx) ctx.roundRect(bx, by, tw, th, 9 * S); else ctx.rect(bx, by, tw, th);
        ctx.fillStyle = "#1a1a18"; ctx.fill();
        ctx.fillStyle = "#fdf6ec"; ctx.textAlign = "center";
        ctx.fillText(label, bx + tw / 2, by + th / 2 + S);
      }
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      draw(dt);
      if (vis && !reduce) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && vis && !reduce) { last = 0; raf = requestAnimationFrame(tick); } };

    const io = new IntersectionObserver((es) => {
      vis = es[0].isIntersecting;
      if (vis && reduce) draw(0);
      kick();
    }, { rootMargin: "100px 0px" });
    io.observe(el);

    const move = (e: PointerEvent) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.has = true; kick(); };
    const down = () => {
      if (hover < 0) return;
      for (let k = 0; k < 3; k++) pulses.push({ n: hover, p: -k * 0.09 });
      if (pulses.length > 16) pulses.splice(0, pulses.length - 16);
    };
    const leave = () => { ptr.has = false; };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerleave", leave);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="union-net"
      role="img"
      aria-label="Diagram: the records of 28 states and 8 union territories, each connected to one Union archive"
    />
  );
}

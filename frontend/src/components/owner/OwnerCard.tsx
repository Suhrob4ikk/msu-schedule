"use client";
/**
 * Карта владельца в Кабинете (11 окт 2026): «№ 000 · Админ». Фон — фрактал
 * Мандельброта («долина морских коньков»), считается в браузере один раз; поверх —
 * затенение под надписями, голографический перелив, бегущий блик, тождество Эйлера.
 * Наклон — за мышью и наклоном телефона. Ниже — пользователи из пульта.
 */
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/tablo/Icon";

const API = process.env.NEXT_PUBLIC_API_URL!;

function drawMandelbrot(c: HTMLCanvasElement) {
  const w = (c.width = Math.round(c.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
  const h = (c.height = Math.round(c.clientHeight * Math.min(2, window.devicePixelRatio || 1)));
  const ctx = c.getContext("2d");
  if (!ctx || !w || !h) return;
  const img = ctx.createImageData(w, h);
  const cx0 = -0.743644786, cy0 = 0.1318252536, sc = 0.0042 / w, maxI = 420;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x0 = cx0 + (px - w / 2) * sc, y0 = cy0 + (py - h / 2) * sc;
      let x = 0, y = 0, i = 0;
      while (x * x + y * y < 4 && i < maxI) { const t = x * x - y * y + x0; y = 2 * x * y + y0; x = t; i++; }
      const k = (py * w + px) * 4;
      if (i === maxI) { img.data[k] = 6; img.data[k + 1] = 8; img.data[k + 2] = 26; }
      else {
        const v = i + 1 - Math.log2(Math.log2(x * x + y * y) / 2);
        const t = Math.min(1, Math.pow(v / 300, 0.75));
        img.data[k] = 20 + 230 * Math.pow(t, 0.9) * (0.6 + 0.4 * Math.sin(v * 0.15));
        img.data[k + 1] = 30 + 160 * Math.pow(t, 0.6);
        img.data[k + 2] = 80 + 175 * Math.pow(t, 0.4);
      }
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

interface Pulse { users: number; today: number; app: number }

export default function OwnerCard({ name, group, onEdit }: { name: string; group: string | null; onEdit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (c) requestAnimationFrame(() => drawMandelbrot(c));
    let device = "";
    try { device = localStorage.getItem("msu_device_id_v2") ?? ""; } catch { /* приватный режим */ }
    if (device) fetch(`${API}/user/owner-pulse?device_id=${encodeURIComponent(device)}`).then(r => (r.ok ? r.json() : null)).then(setPulse).catch(() => {});
  }, []);

  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const tilt = (px: number, py: number) => { el.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 16}deg) rotateX(${(0.5 - py) * 12}deg)`; };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); tilt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
    const reset = () => { el.style.transform = ""; };
    const onOri = (e: DeviceOrientationEvent) => { if (e.gamma != null && e.beta != null) tilt(Math.min(1, Math.max(0, 0.5 + e.gamma / 50)), Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 50))); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    window.addEventListener("deviceorientation", onOri);
    return () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", reset); window.removeEventListener("deviceorientation", onOri); };
  }, []);

  return (
    <section className="ow-me">
      <div className="ow-card" ref={card}>
        <canvas ref={canvas} aria-hidden="true" />
        <span className="ow-card-shade" /><span className="ow-card-holo" /><span className="ow-card-glint" />
        <div className="ow-card-top"><span>МГУ · РАСПИСАНИЕ</span><span>№ 000</span></div>
        <div className="ow-card-who">
          <div className="ow-card-eq">e<sup>iπ</sup> + 1 = 0</div>
          <div className="ow-card-name">{name}</div>
          <div className="ow-card-role">АДМИН{group ? ` · ${group}` : ""}</div>
        </div>
      </div>
      {pulse && (
        <div className="ow-stats">
          <div className="ow-glass"><b>{pulse.users}</b><span>всего</span></div>
          <div className="ow-glass"><b>{pulse.app}</b><span>в приложении</span></div>
          <div className="ow-glass"><b>{pulse.today}</b><span>сегодня</span></div>
        </div>
      )}
      <div className="t-pf-card">
        <button type="button" className="t-pf-link" onClick={onEdit}>Изменить имя или группу<Icon name="chevronRight" size={20} /></button>
      </div>
    </section>
  );
}

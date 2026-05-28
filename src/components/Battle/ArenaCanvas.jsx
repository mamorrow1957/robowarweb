import React, { useRef, useEffect } from 'react';

const CANVAS_PX = 600;

function drawBar(ctx, x, y, w, h, pct, color) {
  ctx.fillStyle = '#1c2128';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
}

export default function ArenaCanvas({ frame, arenaWidth = 300, arenaHeight = 300 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext('2d');

    const sx = CANVAS_PX / arenaWidth;
    const sy = CANVAS_PX / arenaHeight;
    const scale = Math.min(sx, sy);
    const offX = (CANVAS_PX - arenaWidth * scale) / 2;
    const offY = (CANVAS_PX - arenaHeight * scale) / 2;

    const tx = (lx) => offX + lx * scale;
    const ty = (ly) => offY + ly * scale;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    // Arena border
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 2;
    ctx.strokeRect(offX, offY, arenaWidth * scale, arenaHeight * scale);

    // Grid lines (subtle)
    ctx.strokeStyle = '#161b22';
    ctx.lineWidth = 0.5;
    const gridStep = 50 * scale;
    for (let gx = offX; gx <= offX + arenaWidth * scale; gx += gridStep) {
      ctx.beginPath(); ctx.moveTo(gx, offY); ctx.lineTo(gx, offY + arenaHeight * scale); ctx.stroke();
    }
    for (let gy = offY; gy <= offY + arenaHeight * scale; gy += gridStep) {
      ctx.beginPath(); ctx.moveTo(offX, gy); ctx.lineTo(offX + arenaWidth * scale, gy); ctx.stroke();
    }

    // Projectiles
    for (const p of frame.projectiles) {
      if (!p.alive) continue;
      const px = tx(p.x), py = ty(p.y);
      ctx.beginPath();
      ctx.arc(px, py, p.radius * scale * 0.8, 0, Math.PI * 2);
      if (p.type === 'bullet')  ctx.fillStyle = '#ffffff';
      else if (p.type === 'missile') ctx.fillStyle = '#ffa502';
      else                      ctx.fillStyle = '#1e90ff';
      ctx.fill();
    }

    // Robots
    const R = 8 * scale;
    ctx.font = `${Math.max(9, 10 * scale)}px sans-serif`;
    ctx.textAlign = 'center';

    for (const r of frame.robots) {
      const rx = tx(r.x), ry = ty(r.y);

      if (!r.alive) {
        // Ghost / explosion mark
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(rx, ry, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 1;
        const d = R * 0.7;
        ctx.beginPath(); ctx.moveTo(rx-d, ry-d); ctx.lineTo(rx+d, ry+d); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx+d, ry-d); ctx.lineTo(rx-d, ry+d); ctx.stroke();
        continue;
      }

      // Shield glow
      if (r.shieldActive) {
        ctx.beginPath();
        ctx.arc(rx, ry, R * 1.7, 0, Math.PI * 2);
        ctx.strokeStyle = r.color + '60';
        ctx.lineWidth = 3 * scale;
        ctx.stroke();
      }

      // SCAN direction indicator (cyan) — shown only when offset from aim
      if (r.scanAngle !== undefined) {
        const scanDiff = ((r.scanAngle - r.aimAngle) % 360 + 360) % 360;
        if (scanDiff > 0.5 && scanDiff < 359.5) {
          const scanRad = r.scanAngle * Math.PI / 180;
          ctx.strokeStyle = '#00d0ff70';
          ctx.lineWidth = 1 * scale;
          ctx.setLineDash([3 * scale, 2 * scale]);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + Math.cos(scanRad) * R * 3, ry + Math.sin(scanRad) * R * 3);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // LOOK direction indicator (purple) — shown only when offset from aim
      if (r.lookAngle !== undefined) {
        const lookDiff = ((r.lookAngle - r.aimAngle) % 360 + 360) % 360;
        if (lookDiff > 0.5 && lookDiff < 359.5) {
          const lookRad = r.lookAngle * Math.PI / 180;
          ctx.strokeStyle = '#a78bfa70';
          ctx.lineWidth = 1 * scale;
          ctx.setLineDash([2 * scale, 3 * scale]);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + Math.cos(lookRad) * R * 3, ry + Math.sin(lookRad) * R * 3);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Aim indicator
      const aimRad = r.aimAngle * Math.PI / 180;
      ctx.strokeStyle = r.color + 'a0';
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(aimRad) * R * 2.5, ry + Math.sin(aimRad) * R * 2.5);
      ctx.stroke();

      // Body
      ctx.beginPath();
      ctx.arc(rx, ry, R, 0, Math.PI * 2);
      ctx.fillStyle = r.color;
      ctx.fill();

      // Name
      ctx.fillStyle = '#c9d1d9';
      ctx.fillText(r.name, rx, ry - R - 4 * scale);

      // HP bar
      const bw = R * 3, bh = 3 * scale;
      const bx = rx - bw / 2;
      drawBar(ctx, bx, ry + R + 3 * scale, bw, bh, r.armor / r.maxArmor, '#3fb950');
      drawBar(ctx, bx, ry + R + 3 * scale + bh + 1, bw, bh, r.energy / r.maxEnergy, '#58a6ff');
    }

    // Tick counter overlay
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6e7681';
    ctx.fillText(`tick ${frame.tick}`, offX + 4, offY + 14);

    // Result banner
    if (frame.result) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(CANVAS_PX / 4, CANVAS_PX / 2 - 30, CANVAS_PX / 2, 60);
      ctx.globalAlpha = 1;
      ctx.font = `bold ${16 * Math.min(sx, sy)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#3fb950';
      ctx.fillText(
        frame.result.winnerName
          ? `${frame.result.winnerName} wins!`
          : 'Draw!',
        CANVAS_PX / 2,
        CANVAS_PX / 2 + 6
      );
    }
  }, [frame, arenaWidth, arenaHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_PX}
      height={CANVAS_PX}
      className="arena-canvas"
    />
  );
}

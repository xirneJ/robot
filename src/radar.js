const WORLD_RANGE = 30;

export function createRadar(canvas, world, robot, mission, autopilot) {
  const ctx = canvas.getContext('2d');
  const contactList = document.querySelector('#radar-contacts');
  const state = { visible: false, dpr: 1, size: 560 };
  let lastDraw = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.size = Math.max(420, Math.min(rect.width || 560, rect.height || 560));
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(state.size * state.dpr);
    canvas.height = Math.floor(state.size * state.dpr);
  }

  function screenPoint(x, z) {
    const center = state.size / 2;
    const radius = state.size * .43;
    return {
      x: center + (x - robot.root.position.x) / WORLD_RANGE * radius,
      y: center + (z - robot.root.position.z) / WORLD_RANGE * radius
    };
  }

  function draw(time) {
    if (!state.visible) return;
    const size = state.size;
    const center = size / 2;
    const radius = size * .43;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const bg = ctx.createRadialGradient(center, center, 0, center, center, radius);
    bg.addColorStop(0, 'rgba(12,28,30,.96)');
    bg.addColorStop(.72, 'rgba(5,13,15,.98)');
    bg.addColorStop(1, 'rgba(2,6,7,1)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(93,211,223,.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.arc(center, center, radius * i / 5, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = -4; i <= 4; i++) {
      const offset = radius * i / 5;
      ctx.beginPath(); ctx.moveTo(center + offset, center - radius); ctx.lineTo(center + offset, center + radius); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(center - radius, center + offset); ctx.lineTo(center + radius, center + offset); ctx.stroke();
    }

    const sweep = time * 1.15;
    ctx.save();
    ctx.translate(center, center); ctx.rotate(sweep);
    const grad = ctx.createLinearGradient(0, 0, 0, -radius);
    grad.addColorStop(0, 'rgba(88,222,235,0)'); grad.addColorStop(1, 'rgba(88,222,235,.2)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, -Math.PI / 2 - .25, -Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(70,84,86,.34)'; ctx.strokeStyle = 'rgba(147,163,160,.25)';
    for (const c of world.colliders) {
      const a = screenPoint(c.minX, c.minZ); const b = screenPoint(c.maxX, c.maxZ);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    for (const t of world.tightSpaces || []) {
      const a = screenPoint(t.minX, t.minZ); const b = screenPoint(t.maxX, t.maxZ);
      ctx.fillStyle = 'rgba(244,173,81,.08)'; ctx.strokeStyle = 'rgba(244,173,81,.55)';
      ctx.setLineDash([5, 4]); ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
    }

    for (const zone of world.searchZones) {
      const p = screenPoint(zone.position.x, zone.position.z); const r = zone.radius / WORLD_RANGE * radius;
      ctx.strokeStyle = zone.evidence.uploaded ? 'rgba(139,222,143,.38)' : 'rgba(244,173,81,.36)';
      ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(233,230,220,.46)'; ctx.font = '10px Cascadia Mono, Consolas, monospace'; ctx.fillText(zone.id, p.x + 5, p.y - 5);
    }

    if (autopilot.state.enabled && autopilot.state.path.length) {
      ctx.strokeStyle = 'rgba(98,212,228,.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.beginPath();
      autopilot.state.path.forEach((point, index) => { const p = screenPoint(point.x, point.z); if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke(); ctx.setLineDash([]);
    }

    const contacts = mission.state.contacts || [];
    for (const contact of contacts) {
      const p = screenPoint(contact.position.x, contact.position.z);
      const color = contact.uploaded ? '#91e495' : contact.confirmed ? '#f5ad51' : '#67d9e7';
      ctx.save(); ctx.translate(p.x, p.y); ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, -6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, 3); ctx.quadraticCurveTo(0, -3, 6, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(7, 7); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(233,230,220,.9)';
      ctx.font = '600 10px Bahnschrift, sans-serif'; ctx.fillText(`疑似人员 ${contact.id}`, 10, 1);
      ctx.fillStyle = color; ctx.font = '9px Cascadia Mono, Consolas, monospace';
      ctx.fillText(`${contact.temperature.toFixed(1)}°C  ${Math.round(contact.confidence * 100)}%`, 10, 13);
      ctx.restore();
    }

    ctx.save(); ctx.translate(center, center); ctx.rotate(-robot.root.rotation.y); ctx.fillStyle = '#e9e6dc';
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.restore();

    ctx.strokeStyle = 'rgba(233,230,220,.36)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(233,230,220,.72)'; ctx.font = '600 10px Cascadia Mono, Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('北', center, center - radius - 12); ctx.fillText('南', center, center + radius + 20);
    ctx.fillText('西', center - radius - 14, center + 4); ctx.fillText('东', center + radius + 14, center + 4); ctx.textAlign = 'start';

    if (contactList) {
      contactList.innerHTML = contacts.length ? contacts.map((contact) => `
        <div class="radar-contact ${contact.confirmed ? 'confirmed' : ''}">
          <span class="contact-icon"></span>
          <div><b>疑似人员 ${contact.id}</b><small>${contact.label}</small></div>
          <strong>${contact.temperature.toFixed(1)}°C</strong>
          <em>${Math.round(contact.confidence * 100)}%</em>
        </div>
      `).join('') : '<p class="radar-empty">尚未检测到人体热源<br><span>进入搜索区并驻停，温度传感器会自动收敛</span></p>';
    }
  }

  return {
    state,
    get visible() { return state.visible; },
    toggle(force) { state.visible = typeof force === 'boolean' ? force : !state.visible; if (state.visible) resize(); return state.visible; },
    resize,
    update(time = performance.now() / 1000) { if (!state.visible) return; if (time - lastDraw > .033) { lastDraw = time; draw(time); } }
  };
}

// =====================================================
// OCEAN SEAFOOD - FILE: js/ocean-fx.js
// Canvas: ca boi tu dong, duoi theo con tro chuot,
// va gon song lan toa tai vi tri chuot
// Chi chay o trang co #ocean-fx (index.html)
// =====================================================

(function () {
  var canvas = document.getElementById("ocean-fx");
  if (!canvas) return;
  if (window.matchMedia("(max-width: 900px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var ctx = canvas.getContext("2d");
  var container = canvas.parentElement;
  var width = 0, height = 0;
  var mouse = { x: -9999, y: -9999, active: false };
  var ripples = [];
  var fishes = [];
  var FISH_COUNT = 7;

  // ---------- Kich thuoc canvas khop voi khung chua ----------
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = width;
    canvas.height = height;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- Theo doi chuot ----------
  document.addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.active = true;

    // Cứ mỗi 90ms thì thả 1 vòng gợn sóng mới tại vị trí chuột
    var now = Date.now();
    if (!mouse.lastRipple || now - mouse.lastRipple > 90) {
      mouse.lastRipple = now;
      ripples.push({ x: mouse.x, y: mouse.y, r: 2, life: 1 });
      if (ripples.length > 40) ripples.shift();
    }
  });
  document.addEventListener("mouseleave", function () { mouse.active = false; });

 // ---------- Tao dan ca ----------
  var colors = ["rgba(255,210,170,0.9)", "rgba(185,230,255,0.88)", "rgba(255,235,180,0.9)"];
  var glowColors = ["255,215,150", "140,225,255", "255,235,165"];
  for (var i = 0; i < FISH_COUNT; i++) {
    fishes.push({
      x: Math.random() * (width || 800),
      y: 60 + Math.random() * ((height || 500) - 120),
      vx: 0, vy: 0,
      angle: 0,
      size: 16 + Math.random() * 10,
      color: colors[i % colors.length],
      glowRgb: glowColors[i % glowColors.length],
      wander: Math.random() * Math.PI * 2,
      wagPhase: Math.random() * Math.PI * 2,
      followDelay: Math.random() * 0.4,
      trail: [],
      sparkles: []
    });
  }

  // Ham tinh do uon song doc theo than ca (t = 0 o mui, t = 1 o chop duoi)
  function spineOffset(f, t, amp) {
    return Math.sin(f.wagPhase - t * 3.4) * (t * t) * amp;
  }

  // ---------- Ve vet sang phat quang phia sau ca ----------
  function drawFishTrail(f) {
    if (f.trail.length < 2 && f.sparkles.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Ve luong sang mem theo quy dao duoi ca
    for (var i = 1; i < f.trail.length; i++) {
      var p0 = f.trail[i - 1];
      var p1 = f.trail[i];
      var ratio = i / f.trail.length;
      var alpha = p1.life * ratio * Math.min(0.55, 0.14 + p1.speed * 0.1);
      if (alpha <= 0.005) continue;

      // Lop quang sang rong (outer glow)
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = "rgba(" + f.glowRgb + "," + (alpha * 0.45).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1.5, f.size * 0.55 * ratio * p1.life);
      ctx.stroke();

      // Lop loi sang manh (core)
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = "rgba(255,255,255," + (alpha * 0.75).toFixed(3) + ")";
      ctx.lineWidth = Math.max(0.8, f.size * 0.16 * ratio * p1.life);
      ctx.stroke();
    }

    // Ve cac hat sang li ti tan ra khi boi nhanh
    for (var j = 0; j < f.sparkles.length; j++) {
      var sp = f.sparkles[j];
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r * sp.life, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + f.glowRgb + "," + (sp.life * 0.65).toFixed(3) + ")";
      ctx.fill();
    }

    ctx.restore();
  }

  // ---------- Ve 1 con ca uon luon mem mai ----------
  function drawFish(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);

    var s = f.size;
    var amp = s * 0.45;

    // 5 dot doc theo than tu mui den cuong duoi
    var pts = [
      { t: 0.00, x:  s * 0.95, w: 0 },
      { t: 0.22, x:  s * 0.48, w: s * 0.40 },
      { t: 0.48, x:  0,        w: s * 0.36 },
      { t: 0.75, x: -s * 0.52, w: s * 0.20 },
      { t: 1.00, x: -s * 0.92, w: s * 0.08 }
    ];
    for (var i = 0; i < pts.length; i++) {
      pts[i].y = spineOffset(f, pts[i].t, amp);
    }

    // 1. Vay nguc hai ben (quat nhe nguoc pha)
    var finWave = Math.sin(f.wagPhase * 0.9 + 0.6) * s * 0.16;
    ctx.save();
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = f.color;

    // Vay nguc tren
    ctx.beginPath();
    ctx.moveTo(pts[1].x * 0.6, pts[1].y - pts[1].w * 0.65);
    ctx.quadraticCurveTo(
      pts[1].x - s * 0.25, pts[1].y - s * 0.95 - finWave,
      pts[2].x - s * 0.35, pts[2].y - s * 0.65 - finWave * 0.6
    );
    ctx.quadraticCurveTo(
      pts[2].x + s * 0.05, pts[2].y - pts[2].w * 0.5,
      pts[1].x * 0.6, pts[1].y - pts[1].w * 0.65
    );
    ctx.fill();

    // Vay nguc duoi
    ctx.beginPath();
    ctx.moveTo(pts[1].x * 0.6, pts[1].y + pts[1].w * 0.65);
    ctx.quadraticCurveTo(
      pts[1].x - s * 0.25, pts[1].y + s * 0.95 + finWave,
      pts[2].x - s * 0.35, pts[2].y + s * 0.65 + finWave * 0.6
    );
    ctx.quadraticCurveTo(
      pts[2].x + s * 0.05, pts[2].y + pts[2].w * 0.5,
      pts[1].x * 0.6, pts[1].y + pts[1].w * 0.65
    );
    ctx.fill();
    ctx.restore();

    // 2. Vay duoi xe mem mai (uon tre pha hon cuong duoi)
    var tailBase = pts[4];
    var tailTipY = spineOffset(f, 1.32, amp);
    var tailSpread = s * 0.52;
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(tailBase.x, tailBase.y - tailBase.w);
    ctx.quadraticCurveTo(
      -s * 1.25, (tailBase.y + tailTipY) * 0.5 - tailSpread * 0.55,
      -s * 1.72, tailTipY - tailSpread
    );
    ctx.quadraticCurveTo(
      -s * 1.35, tailTipY,
      -s * 1.72, tailTipY + tailSpread
    );
    ctx.quadraticCurveTo(
      -s * 1.25, (tailBase.y + tailTipY) * 0.5 + tailSpread * 0.55,
      tailBase.x, tailBase.y + tailBase.w
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Than ca uon cong bang duong cong muot qua cac dot
    var topPts = [], botPts = [];
    for (var k = 0; k < pts.length; k++) {
      topPts.push({ x: pts[k].x, y: pts[k].y - pts[k].w });
      botPts.push({ x: pts[k].x, y: pts[k].y + pts[k].w });
    }

    var bodyGrad = ctx.createLinearGradient(pts[0].x, 0, pts[4].x, 0);
    bodyGrad.addColorStop(0, f.color);
    bodyGrad.addColorStop(1, "rgba(" + f.glowRgb + ",0.55)");

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var t = 1; t < topPts.length - 1; t++) {
      var xc = (topPts[t].x + topPts[t + 1].x) / 2;
      var yc = (topPts[t].y + topPts[t + 1].y) / 2;
      ctx.quadraticCurveTo(topPts[t].x, topPts[t].y, xc, yc);
    }
    ctx.lineTo(topPts[topPts.length - 1].x, topPts[topPts.length - 1].y);
    ctx.lineTo(botPts[botPts.length - 1].x, botPts[botPts.length - 1].y);
    for (var b = botPts.length - 2; b >= 1; b--) {
      var xcb = (botPts[b].x + botPts[b - 1].x) / 2;
      var ycb = (botPts[b].y + botPts[b - 1].y) / 2;
      ctx.quadraticCurveTo(botPts[b].x, botPts[b].y, xcb, ycb);
    }
    ctx.closePath();
    ctx.fill();

    // 4. Mat ca (lech nhe theo dot dau cho tu nhien)
    ctx.fillStyle = "rgba(10,30,50,0.75)";
    ctx.beginPath();
    ctx.arc(s * 0.56, pts[1].y * 0.5 - s * 0.11, s * 0.085, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- Cap nhat vi tri ca moi khung hinh ----------
  function updateFish(f, dt) {
    var targetX, targetY;
    if (mouse.active) {
      var orbitAngle = f.followDelay * Math.PI * 5 + f.wagPhase * 0.04;
      var orbitRadius = 42 + f.size * 1.5;
      var aimX = mouse.x + Math.cos(orbitAngle) * orbitRadius;
      var aimY = mouse.y + Math.sin(orbitAngle) * orbitRadius;

      var dx = aimX - f.x;
      var dy = aimY - f.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;

      var pull = Math.max(0, Math.min(1, dist / 140));
      var reach = 140 + (1 - f.followDelay) * 50;

      targetX = f.x + (dx / dist) * pull * reach;
      targetY = f.y + (dy / dist) * pull * reach;
    } else {
      f.wander += (Math.random() - 0.5) * 0.4;
      targetX = f.x + Math.cos(f.wander) * 120;
      targetY = f.y + Math.sin(f.wander) * 60;
    }

    targetX = Math.max(20, Math.min(width - 20, targetX));
    targetY = Math.max(20, Math.min(height - 20, targetY));

    var ax = (targetX - f.x) * 0.02;
    var ay = (targetY - f.y) * 0.02;
    f.vx += ax;
    f.vy += ay;
    f.vx *= 0.92;
    f.vy *= 0.92;

    var speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    // Ca boi cang nhanh thi tan so vay duoi cang nhanh
    f.wagPhase += dt * (5 + speed * 1.35);
    f.x += f.vx;
    f.y += f.vy;

    if (speed > 0.05) {
      var targetAngle = Math.atan2(f.vy, f.vx);
      var diff = targetAngle - f.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      f.angle += diff * 0.12;
    }

    // Luu vi tri duoi ca vao vet sang (tinh ca do vay cua duoi)
    var tailSway = spineOffset(f, 1.0, f.size * 0.45);
    var cosA = Math.cos(f.angle), sinA = Math.sin(f.angle);
    var tailX = f.x - cosA * f.size * 0.95 - sinA * tailSway;
    var tailY = f.y - sinA * f.size * 0.95 + cosA * tailSway;

    f.trail.push({ x: tailX, y: tailY, life: 1, speed: speed });
    if (f.trail.length > 18) f.trail.shift();

    for (var i = f.trail.length - 1; i >= 0; i--) {
      f.trail[i].life -= dt * 2.2;
      if (f.trail[i].life <= 0) f.trail.splice(i, 1);
    }

    // Tha hat sang li ti khi ca luot nhanh
    if (speed > 1.1 && Math.random() < 0.35) {
      f.sparkles.push({
        x: tailX + (Math.random() - 0.5) * 6,
        y: tailY + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.2 - Math.random() * 0.4,
        r: 1.4 + Math.random() * 1.8,
        life: 1
      });
    }
    for (var j = f.sparkles.length - 1; j >= 0; j--) {
      var sp = f.sparkles[j];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.life -= dt * 1.8;
      if (sp.life <= 0) f.sparkles.splice(j, 1);
    }
  }

  // ---------- Ve gon song lan toa ----------
  function drawRipples() {
    ripples.forEach(function (r) {
      r.r += 2.4;
      r.life -= 0.018;
      if (r.life <= 0) return;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255," + (r.life * 0.35).toFixed(3) + ")";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });
    ripples = ripples.filter(function (r) { return r.life > 0; });
  }

  // ---------- Vong lap chinh ----------
  var lastTime = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    ctx.clearRect(0, 0, width, height);
    drawRipples();
    fishes.forEach(function (f) {
      updateFish(f, dt);
      drawFishTrail(f);
      drawFish(f);
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
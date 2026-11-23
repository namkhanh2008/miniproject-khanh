// =====================================================
// OCEAN SEAFOOD - FILE: js/shark-game.js
// Game "Ca Map Dai Duong" - mo phong 3D that bang camera
// phoi canh (perspective projection), ca map tu boi ve
// phia truoc, nguoi choi chi dieu huong trai/phai/sau/noi.
// Khong gioi han thoi gian, choi den khi het mau (HP = 0)
// =====================================================

(function () {
  var canvas = document.getElementById("shark-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var oceanBox = document.getElementById("shark-ocean");

  var BEST_KEY = "oceanSeafoodSharkBestLevel";
  var BOARD_KEY = "oceanSeafoodSharkLeaderboard";
  var BOARD_SIZE = 5;

  var width = 0, height = 0;

  // ---------- THONG SO CAMERA PHOI CANH ----------
  var FOCAL = 480;          // tieu cu ao: so lon = thu goc nhin hep, vat nhin to hon
  var PITCH = 0.30;         // goc nghieng camera xuong duoi (radian)
  var CAM_BACK = 150;       // camera cach ca map bao nhieu don vi ve phia sau
  var CAM_UP = 65;          // camera cao hon ca map bao nhieu don vi
  var NEAR_CLIP = 25;       // vat qua gan camera (sau lung) thi khong ve

  var STEER_RANGE_X = 340;  // bien do lai trai/phai
  var MIN_Z = 20, MAX_Z = 260, DEFAULT_Z = 130; // bien do lan sau/noi (0 = gan mat nuoc)

  var camera = { x: 0, y: 0, z: DEFAULT_Z - CAM_UP };

  // ---------- 1. LOAI CA ----------
  var FISH_TYPES = [
    { id: "minnow",   sizeMin: 11, sizeMax: 16, exp: 2,  color: "#bfe3ff", minLevel: 0, weight: 26 },
    { id: "herring",  sizeMin: 16, sizeMax: 23, exp: 5,  color: "#7fb8e0", minLevel: 0, weight: 20 },
    { id: "grouper",  sizeMin: 23, sizeMax: 32, exp: 10, color: "#e0a45a", minLevel: 1, weight: 14 },
    { id: "tuna",     sizeMin: 28, sizeMax: 35, exp: 16, color: "#2f5f8f", minLevel: 3, weight: 10 },
    { id: "barracuda",sizeMin: 30, sizeMax: 40, exp: 30, color: "#c9d6de", minLevel: 2, weight: 8, predator: true },
    { id: "jellyfish",sizeMin: 13, sizeMax: 13, exp: 0,  color: "#c79be0", minLevel: 0, weight: 10, hazard: true },
    { id: "golden",   sizeMin: 12, sizeMax: 12, exp: 40, color: "#f0c84a", minLevel: 0, weight: 2,  bonus: true }
  ];

  var SKILLS = [
    { level: 2,  key: "Cách", name: "Lướt nhanh" },
    { level: 5,  key: "",     name: "Hàm rộng" },
    { level: 9,  key: "F",    name: "Cuồng nộ" },
    { level: 15, key: "",     name: "Hồi phục nhanh" },
    { level: 20, key: "",     name: "Vua đại dương" }
  ];

  var shark, fishes, running, lastTime, particles;

  function resize() {
    width = oceanBox.clientWidth;
    height = oceanBox.clientHeight;
    canvas.width = width;
    canvas.height = height;
  }
  window.addEventListener("resize", resize);

  function expToNext(level) { return Math.round(15 * Math.pow(level, 1.4)) + 10; }
  function sizeForLevel(level) { return 24 + level * 2.4; }
  function maxHpForLevel(level) { return 100 + level * 10; }
  function speedForLevel(level) { return 95 + Math.min(70, level * 3); } // don vi the gioi / giay (chieu Y)
  function hasSkill(level, lv) { return level >= lv; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function createShark() {
    return {
      x: 0, y: 0, z: DEFAULT_Z,
      level: 1, exp: 0, expNeed: expToNext(1),
      size: sizeForLevel(1), maxHp: maxHpForLevel(1), hp: maxHpForLevel(1),
      dashCooldown: 0, dashTimer: 0,
      frenzyCooldown: 0, frenzyTimer: 0
    };
  }
  function biteMultiplier(s) { return hasSkill(s.level, 5) ? 1.05 : 0.85; }

  function randomFishType(level) {
    var pool = FISH_TYPES.filter(function (t) { return t.minLevel <= level; });
    var total = pool.reduce(function (s, t) { return s + t.weight; }, 0);
    var roll = Math.random() * total;
    for (var i = 0; i < pool.length; i++) { roll -= pool[i].weight; if (roll <= 0) return pool[i]; }
    return pool[0];
  }

  // Ca sinh ra PHIA TRUOC ca map mot khoang xa (se "hien ra tu chan troi" khi ca map tien toi)
  function spawnFish() {
    var type = randomFishType(shark.level);
    var size = type.sizeMin + Math.random() * (type.sizeMax - type.sizeMin);
    var aheadDist = 1000 + Math.random() * 900;
    return {
      type: type, size: size,
      x: shark.x + (Math.random() - 0.5) * (STEER_RANGE_X * 2.4),
      y: shark.y + aheadDist,
      z: MIN_Z + Math.random() * (MAX_Z - MIN_Z),
      vx: (Math.random() - 0.5) * 10, vz: (Math.random() - 0.5) * 8,
      wander: Math.random() * Math.PI * 2, wag: Math.random() * Math.PI * 2
    };
  }
  function targetFishCount() { return Math.min(30, 14 + Math.floor(shark.level * 0.8)); }

  // ---------- 2. DIEU KHIEN ----------
  var pointer = { x: null, y: null };
  function setPointer(clientX, clientY) {
    var rect = oceanBox.getBoundingClientRect();
    pointer.x = clientX - rect.left;
    pointer.y = clientY - rect.top;
  }
  oceanBox.addEventListener("mousemove", function (e) { setPointer(e.clientX, e.clientY); });
  oceanBox.addEventListener("touchmove", function (e) {
    if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener("keydown", function (e) {
    if (!running) return;
    if (e.code === "Space" && hasSkill(shark.level, 2) && shark.dashCooldown <= 0) {
      shark.dashTimer = 0.4; shark.dashCooldown = 4; e.preventDefault();
    }
    if ((e.key === "f" || e.key === "F") && hasSkill(shark.level, 9) && shark.frenzyCooldown <= 0) {
      shark.frenzyTimer = 5; shark.frenzyCooldown = 20;
    }
  });

  // ---------- 3. HUD ----------
  function renderSkillBadges() {
    document.getElementById("shark-skills").innerHTML = SKILLS.map(function (s) {
      var on = hasSkill(shark.level, s.level);
      return '<span class="skill-badge' + (on ? " unlocked" : "") + '">' +
        (s.key ? '<span class="skill-key">' + s.key + '</span>' : "") +
        s.name + " (Lv" + s.level + ")</span>";
    }).join("");
  }
  function updateHud() {
    document.getElementById("shark-level").textContent = shark.level;
    document.getElementById("shark-exp-fill").style.width = Math.min(100, (shark.exp / shark.expNeed) * 100) + "%";
    document.getElementById("shark-hp-fill").style.width = Math.max(0, (shark.hp / shark.maxHp) * 100) + "%";
    document.getElementById("shark-best-level").textContent = getBestLevel();
  }
  function getBestLevel() { return Number(localStorage.getItem(BEST_KEY)) || 1; }
  function saveBestLevel(l) { localStorage.setItem(BEST_KEY, String(l)); }

  function getBoard() { try { return JSON.parse(localStorage.getItem(BOARD_KEY)) || []; } catch (e) { return []; } }
  function saveBoard(l) { localStorage.setItem(BOARD_KEY, JSON.stringify(l)); }
  function qualifiesForBoard(level) {
    var l = getBoard(); return l.length < BOARD_SIZE || level > l[l.length - 1].level;
  }
  function addToBoard(name, level) {
    var l = getBoard();
    l.push({ name: (name || "").trim() || "Ẩn danh", level: level });
    l.sort(function (a, b) { return b.level - a.level; });
    saveBoard(l.slice(0, BOARD_SIZE)); renderBoard();
  }
  function renderBoard() {
    var box = document.getElementById("shark-leaderboard-list");
    var l = getBoard();
    if (!l.length) { box.innerHTML = "<li>Chưa có kỷ lục nào. Hãy là người đầu tiên!</li>"; return; }
    box.innerHTML = l.map(function (e) {
      var safe = (typeof escapeHTML === "function") ? escapeHTML(e.name) : e.name;
      return "<li><strong>" + safe + "</strong> — Cấp " + e.level + "</li>";
    }).join("");
  }

  function levelUp() {
    while (shark.exp >= shark.expNeed) {
      shark.exp -= shark.expNeed; shark.level++;
      shark.expNeed = expToNext(shark.level);
      shark.size = sizeForLevel(shark.level);
      var oldMax = shark.maxHp;
      shark.maxHp = maxHpForLevel(shark.level);
      shark.hp = Math.min(shark.maxHp, shark.hp + (shark.maxHp - oldMax));
      renderSkillBadges();
      if (window.SoundFX) SoundFX.playSuccess();
      if (shark.level % 5 === 0 && window.fireConfetti) fireConfetti();
    }
  }
  function spawnParticle(x, y, z, text, color) { particles.push({ x: x, y: y, z: z, text: text, color: color, life: 1 }); }

  // ---------- 4. CAP NHAT MOI KHUNG HINH ----------
  function update(dt) {
    // --- Lai theo chuot: muc tieu X/Z, ca map luon tien ve phia truoc theo Y ---
    if (pointer.x !== null) {
      var targetX = clamp(((pointer.x - width / 2) / (width / 2)) * STEER_RANGE_X, -STEER_RANGE_X, STEER_RANGE_X);
      var targetZ = clamp(DEFAULT_Z + ((pointer.y - height / 2) / (height / 2)) * (DEFAULT_Z - 20), MIN_Z, MAX_Z);
      var turn = Math.min(1, dt * 3.2);
      shark.x += (targetX - shark.x) * turn;
      shark.z += (targetZ - shark.z) * turn;
    }

    var speed = speedForLevel(shark.level);
    if (shark.dashTimer > 0) speed *= 2.6;
    if (shark.frenzyTimer > 0) speed *= 1.4;
    shark.y += speed * dt;   // luon boi ve phia truoc, khong bao gio dung

    shark.dashCooldown = Math.max(0, shark.dashCooldown - dt);
    shark.dashTimer = Math.max(0, shark.dashTimer - dt);
    shark.frenzyCooldown = Math.max(0, shark.frenzyCooldown - dt);
    shark.frenzyTimer = Math.max(0, shark.frenzyTimer - dt);
    shark.hp = Math.min(shark.maxHp, shark.hp + (hasSkill(shark.level, 15) ? 4 : 2) * dt);

    // --- Camera bam theo ca map (co do tre nhe tao cam giac "lai") ---
    camera.x += (shark.x - camera.x) * Math.min(1, dt * 4);
    camera.y = shark.y - CAM_BACK;
    camera.z += ((shark.z - CAM_UP) - camera.z) * Math.min(1, dt * 4);

    // --- Cap nhat ca & va cham ---
    for (var i = fishes.length - 1; i >= 0; i--) {
      var f = fishes[i];
      f.wander += (Math.random() - 0.5) * 0.4;
      f.vx += Math.cos(f.wander) * 4 * dt; f.vz += Math.sin(f.wander) * 3 * dt;
      f.vx = clamp(f.vx, -14, 14); f.vz = clamp(f.vz, -10, 10);
      f.x += f.vx * dt; f.z = clamp(f.z + f.vz * dt, MIN_Z, MAX_Z);
      f.wag += dt * 5;

      var dx = f.x - shark.x, dy = f.y - shark.y, dz = f.z - shark.z;
      var d3 = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d3 < shark.size * 0.8 + f.size * 0.5) {
        if (f.type.hazard) {
          if (shark.frenzyTimer <= 0) {
            shark.hp -= 12; spawnParticle(f.x, f.y, f.z, "-12", "#ff8a7a");
            if (window.SoundFX) SoundFX.playCatch(-1);
          }
          fishes.splice(i, 1);
        } else if (f.size <= shark.size * biteMultiplier(shark)) {
          shark.exp += f.type.exp;
          spawnParticle(f.x, f.y, f.z, "+" + f.type.exp, f.type.bonus ? "#f0c84a" : "#9fe3ff");
          if (window.SoundFX) SoundFX.playCatch(f.type.exp);
          levelUp(); fishes.splice(i, 1);
        } else if (shark.frenzyTimer <= 0) {
          var dmg = f.type.predator ? 18 : 10;
          shark.hp -= dmg; spawnParticle(shark.x, shark.y, shark.z, "-" + dmg, "#ff8a7a");
          if (window.SoundFX) SoundFX.playCatch(-1);
        }
      }
      // Da boi qua phia sau ca map mot khoang -> xoa de do tai nguyen
      if (f.y < shark.y - 350) fishes.splice(i, 1);
    }
    while (fishes.length < targetFishCount()) fishes.push(spawnFish());

    for (var p = particles.length - 1; p >= 0; p--) {
      particles[p].z -= 18 * dt; particles[p].life -= dt * 1.1;
      if (particles[p].life <= 0) particles.splice(p, 1);
    }
    if (shark.hp <= 0) endGame();
  }

  // ---------- 5. CHIEU PHOI CANH 3D -> MAN HINH 2D ----------
  // Day la cong thuc camera phoi canh chuan: dich chuyen diem ve khong gian
  // camera, nghieng theo goc PITCH, roi chia phoi canh (chia cho do sau).
  function project(wx, wy, wz) {
    var relX = wx - camera.x;
    var relY = wy - camera.y;       // do sau truoc camera
    var relZ = wz - camera.z;

    var cosP = Math.cos(PITCH), sinP = Math.sin(PITCH);
    var rotY = relY * cosP + relZ * sinP;   // do sau SAU KHI nghieng camera
    var rotZ = -relY * sinP + relZ * cosP;

    if (rotY < NEAR_CLIP) return null;      // vat o sau lung camera: khong ve

    var scale = FOCAL / rotY;
    return {
      x: width / 2 + relX * scale,
      y: height / 2 + rotZ * scale,
      scale: scale,
      depth: rotY
    };
  }

  function depthFog(depth) {
    // Cang xa camera cang mo dan vao mau nuoc bien (sau tim an diem gan cuoi file)
    return clamp(1 - (depth - 200) / 2600, 0.15, 1);
  }

  function drawHorizonAndFloor() {
    // Nen gradient: tren sang (gan mat nuoc) -> duoi toi (sau xa)
    var grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#1d7bb0");
    grad.addColorStop(0.55, "#0a4d8c");
    grad.addColorStop(1, "#03182c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Luoi san bien chieu phoi canh: tao cam giac chieu sau that
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    var floorZ = MAX_Z + 40;
    for (var g = 1; g <= 12; g++) {
      var gy = shark.y + g * 160;
      var p1 = project(-700, gy, floorZ);
      var p2 = project(700, gy, floorZ);
      if (p1 && p2) { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
    }
    for (var lane = -700; lane <= 700; lane += 140) {
      var a = project(lane, shark.y + 60, floorZ);
      var b = project(lane, shark.y + 2000, floorZ);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
  }

  function drawShadowAt(sx, sy, r, fog) {
    ctx.beginPath();
    ctx.ellipse(sx, sy + r * 0.45, r * 0.85, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0," + (0.2 * fog).toFixed(2) + ")";
    ctx.fill();
  }

  function drawFish(f) {
    var p = project(f.x, f.y, f.z);
    if (!p) return;
    var s = f.size * p.scale;
    if (s < 0.6) return;
    if (p.x < -s * 2 || p.x > width + s * 2 || p.y < -s * 2 || p.y > height + s * 2) return;
    var fog = depthFog(p.depth);

    drawShadowAt(p.x, p.y, s, fog);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = fog;
    var wagAmt = Math.sin(f.wag) * 0.4;
    ctx.fillStyle = f.type.color;
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.85, 0);
    ctx.lineTo(-s * 1.5, -s * 0.5 + wagAmt * s * 0.3);
    ctx.lineTo(-s * 1.5, s * 0.5 + wagAmt * s * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(10,20,30,0.7)";
    ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.12, s * 0.09, 0, Math.PI * 2); ctx.fill();
    if (f.type.hazard) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      for (var k = -2; k <= 2; k++) {
        ctx.beginPath(); ctx.moveTo(k * s * 0.3, s * 0.4);
        ctx.lineTo(k * s * 0.3 + Math.sin(f.wag + k) * 4, s * 0.9); ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawShark() {
    var p = project(shark.x, shark.y, shark.z);
    if (!p) return;
    var s = shark.size * p.scale;
    drawShadowAt(p.x, p.y, s, 1);

    ctx.save();
    ctx.translate(p.x, p.y);
    if (shark.frenzyTimer > 0) { ctx.shadowColor = "rgba(230,198,92,0.9)"; ctx.shadowBlur = 24; }
    var wagAmt = Math.sin(performance.now() * 0.006) * 0.3;
    ctx.fillStyle = "#7891a0";
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.55, s * 0.9, 0, 0, Math.PI * 2); ctx.fill(); // nhin tu sau: than hoi dai
    ctx.fillStyle = "#5f7684";
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, -s * 0.5); ctx.lineTo(s * 0.0, -s * 1.15); ctx.lineTo(s * 0.18, -s * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#7891a0";
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.75);
    ctx.lineTo(-s * 0.55 + wagAmt * s * 0.2, s * 1.25);
    ctx.lineTo(s * 0.1, s * 1.25);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(function (pt) {
      var p = project(pt.x, pt.y, pt.z);
      if (!p) return;
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.font = "bold " + Math.round(14 * p.scale) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(pt.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });
  }

  function render() {
    drawHorizonAndFloor();
    var ordered = fishes.slice().sort(function (a, b) { return b.y - a.y; }); // xa ve truoc (painter's algorithm)
    ordered.forEach(drawFish);
    drawShark();
    drawParticles();
  }

  // ---------- 6. VONG LAP CHINH ----------
  function loop(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt); render(); updateHud();
    requestAnimationFrame(loop);
  }

  function startGame() {
    resize();
    shark = createShark();
    fishes = []; particles = [];
    for (var i = 0; i < targetFishCount(); i++) fishes.push(spawnFish());

    document.getElementById("shark-start").style.display = "none";
    document.getElementById("shark-gameover").style.display = "none";
    renderSkillBadges(); updateHud();

    running = true; lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    var best = getBestLevel();
    var isNewBest = shark.level > best;
    if (isNewBest) saveBestLevel(shark.level);

    document.getElementById("shark-final-level").textContent = shark.level;
    document.getElementById("shark-final-exp").textContent = shark.exp;
    document.getElementById("shark-new-best").style.display = isNewBest ? "block" : "none";

    var nameBox = document.getElementById("shark-name-box");
    if (qualifiesForBoard(shark.level)) {
      nameBox.style.display = "block";
      document.getElementById("shark-name-input").value = "";
    } else { nameBox.style.display = "none"; }

    document.getElementById("shark-gameover").style.display = "flex";
    if (window.SoundFX) SoundFX.playRemove();
  }

  document.addEventListener("DOMContentLoaded", function () {
    resize(); renderBoard();
    shark = createShark(); updateHud();

    document.getElementById("shark-start-btn").addEventListener("click", startGame);
    document.getElementById("shark-restart-btn").addEventListener("click", startGame);
    document.getElementById("shark-name-form").addEventListener("submit", function (e) {
      e.preventDefault();
      addToBoard(document.getElementById("shark-name-input").value, shark.level);
      document.getElementById("shark-name-box").style.display = "none";
    });
  });
  window.addEventListener("beforeunload", function () { running = false; });
})();
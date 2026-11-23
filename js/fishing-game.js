// =====================================================
// OCEAN SEAFOOD - FILE: js/fishing-game.js
// Mini-game phòng chờ săn ưu đãi:
// - 1 điểm = 1.000đ giảm giá (tối đa 100.000đ/đơn)
// - Mỗi 10 sinh vật xuất hiện chắc chắn có 1 Rùa biển 🐢 (+5% giảm giá, bơi nhanh)
// - Sứa biển 🪼 trừ 10 điểm (-10.000đ)
// - Bảng xếp hạng Top 5 ở bảng hiệu bên trái
// =====================================================
(function () {
  var BEST_SCORE_KEY = "oceanSeafoodFishingBest";
  var LEADERBOARD_KEY = "oceanSeafoodFishingLeaderboard";
  var REWARD_KEY = "oceanSeafoodGameReward";
  var LEADERBOARD_SIZE = 5;
  var GAME_DURATION = 60;
  var MAX_FIXED_DISCOUNT = 100000;
  var MAX_PERCENT_DISCOUNT = 15;

  // 1. DANH SÁCH SINH VẬT (không gồm Rùa biển vì Rùa biển ra theo chu kỳ đúng 1/10 con)
  var CREATURES = [
    { id: "ca-com",    name: "Cá cơm",        emoji: "🐟", points: 5,  weight: 22, size: 34, label: "+5k" },
    { id: "ca-nuc",    name: "Cá nục",        emoji: "🐠", points: 5,  weight: 20, size: 36, label: "+5k" },
    { id: "ca-chim",   name: "Cá chim",       emoji: "🐡", points: 8,  weight: 14, size: 38, label: "+8k" },
    { id: "ca-thu",    name: "Cá thu",        emoji: "🐟", points: 10, weight: 12, size: 42, label: "+10k" },
    { id: "tom-he",    name: "Tôm he",        emoji: "🦐", points: 10, weight: 11, size: 40, label: "+10k" },
    { id: "muc-ong",   name: "Mực ống",       emoji: "🦑", points: 12, weight: 9,  size: 44, label: "+12k" },
    { id: "cua-bien",  name: "Cua biển",      emoji: "🦀", points: 15, weight: 7,  size: 46, label: "+15k" },
    { id: "so-diep",   name: "Sò điệp",       emoji: "🦪", points: 15, weight: 7,  size: 38, label: "+15k" },
    { id: "bach-tuoc", name: "Bạch tuộc",     emoji: "🐙", points: 20, weight: 5,  size: 48, label: "+20k" },
    { id: "tom-hum",   name: "Tôm hùm bông",  emoji: "🦞", points: 25, weight: 3,  size: 52, fast: true, label: "+25k" },
    { id: "sua",       name: "Sứa biển",      emoji: "🪼", points: -10, weight: 14, size: 42, bad: true, label: "-10đ" }
  ];

  // Sinh vật đặc biệt: mỗi 10 con xuất hiện có 1 con
  var TURTLE = {
    id: "rua-bien",
    name: "Rùa biển may mắn",
    emoji: "🐢",
    points: 0,
    percentBonus: 5,
    size: 48,
    turtle: true,
    label: "+5%"
  };

  var score = 0;
  var turtlePercent = 0;
  var timeLeft = GAME_DURATION;
  var timerId = null;
  var spawnTimeoutId = null;
  var gameRunning = false;
  var activeCreatures = [];

  // Bộ đếm đảm bảo chính xác trong mỗi 10 con xuất hiện sẽ có 1 con Rùa biển
  var spawnInBatch = 0;
  var turtleSlotInBatch = Math.floor(Math.random() * 10);

  function calcFixedDiscount(pts) {
    return Math.min(MAX_FIXED_DISCOUNT, Math.max(0, pts) * 1000);
  }

  function formatMoneyShort(amount) {
    if (typeof formatPrice === "function") return formatPrice(amount);
    return amount.toLocaleString("vi-VN") + "đ";
  }

  function formatRewardSummary(fixedAmt, pctAmt) {
    var parts = [];
    if (fixedAmt > 0) parts.push("Giảm " + formatMoneyShort(fixedAmt));
    if (pctAmt > 0) parts.push("Giảm thêm " + pctAmt + "%");
    return parts.length ? parts.join(" + ") : "0đ";
  }

  function updateHUD() {
    document.getElementById("game-score").textContent = score;
    document.getElementById("game-money").textContent = formatMoneyShort(calcFixedDiscount(score));
    document.getElementById("game-percent").textContent = "+" + turtlePercent + "%";
  }

  // 2. CHỌN SINH VẬT (đảm bảo 1/10 là Rùa biển)
  function pickNextCreature() {
    var isTurtleTurn = (spawnInBatch === turtleSlotInBatch);
    spawnInBatch++;
    if (spawnInBatch >= 10) {
      spawnInBatch = 0;
      turtleSlotInBatch = Math.floor(Math.random() * 10);
    }
    if (isTurtleTurn) return TURTLE;

    var totalWeight = CREATURES.reduce(function (sum, c) { return sum + c.weight; }, 0);
    var roll = Math.random() * totalWeight;
    for (var i = 0; i < CREATURES.length; i++) {
      roll -= CREATURES[i].weight;
      if (roll <= 0) return CREATURES[i];
    }
    return CREATURES[0];
  }

  // 3. TẠO 1 SINH VẬT BƠI QUA BỂ
  function spawnCreature() {
    if (!gameRunning) return;

    var ocean = document.getElementById("game-ocean");
    var data = pickNextCreature();
    var fromLeft = Math.random() < 0.5;

    var el = document.createElement("div");
    el.className = "game-creature"
      + (fromLeft ? "" : " game-flip")
      + (data.turtle ? " is-turtle" : "");

    // Bọc sprite ở thẻ con để .game-flip (scaleX) không bị animation translateX ghi đè
    var badgeHTML = "";
    if (data.turtle) badgeHTML = '<span class="creature-badge badge-turtle">+5%</span>';
    else if (data.bad) badgeHTML = '<span class="creature-badge badge-jelly">-10đ</span>';

    el.innerHTML =
      badgeHTML +
      '<span class="creature-sprite" style="font-size:' + data.size + 'px">' + data.emoji + "</span>";

    // Cua bò tầng đáy, các loài khác bơi tự do
    var topPercent = (data.id === "cua-bien")
      ? (74 + Math.random() * 12)
      : (12 + Math.random() * 68);

    el.style.top = topPercent + "%";
    el.style.left = fromLeft ? "-70px" : "auto";
    el.style.right = fromLeft ? "auto" : "-70px";

    ocean.appendChild(el);

    // Rùa biển bơi rất nhanh qua màn hình (1.35s - 1.65s)
    var duration;
    if (data.turtle) duration = 1.35 + Math.random() * 0.3;
    else if (data.fast) duration = 1.9 + Math.random() * 0.7;
    else duration = 3.6 + Math.random() * 1.5;

    var travel = ocean.clientWidth + 140;
    var dx = fromLeft ? travel : -travel;
    var waveAmp = data.bad ? 16 : 10;

    var animation = el.animate(
      [
        { transform: "translate(0px, 0px)" },
        { transform: "translate(" + (dx * 0.5) + "px, " + (-waveAmp) + "px)" },
        { transform: "translate(" + dx + "px, " + waveAmp + "px)" }
      ],
      { duration: duration * 1000, easing: "linear" }
    );

    var entry = { el: el, animation: animation };
    activeCreatures.push(entry);

    function cleanup() {
      el.remove();
      activeCreatures = activeCreatures.filter(function (c) { return c !== entry; });
    }
    animation.onfinish = cleanup;

    // Dùng pointerdown để bấm nhạy cả trên chuột và cảm ứng
    el.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
      if (!gameRunning || el.classList.contains("game-caught")) return;
      animation.cancel();
      catchCreature(entry, data);
    });

    spawnTimeoutId = setTimeout(spawnCreature, 420 + Math.random() * 430);
  }

  // 4. XỬ LÝ KHI BẤM TRÚNG
  function catchCreature(entry, data) {
    var el = entry.el;

    if (data.turtle) {
      turtlePercent = Math.min(MAX_PERCENT_DISCOUNT, turtlePercent + data.percentBonus);
      if (window.SoundFX) SoundFX.playSuccess();
      if (window.fireConfetti) fireConfetti();
    } else {
      score = Math.max(0, score + data.points);
      if (window.SoundFX) SoundFX.playCatch(data.points);
      if (data.bad) {
        var ocean = document.getElementById("game-ocean");
        ocean.classList.remove("ocean-shake");
        void ocean.offsetWidth;
        ocean.classList.add("ocean-shake");
      }
    }

    updateHUD();
    el.classList.add("game-caught");
    showFloatingPoints(el, data);
    setTimeout(function () { el.remove(); }, 320);
    activeCreatures = activeCreatures.filter(function (c) { return c !== entry; });
  }

  function showFloatingPoints(el, data) {
    var layer = document.getElementById("game-float-layer");
    var rect = el.getBoundingClientRect();
    var oceanRect = document.getElementById("game-ocean").getBoundingClientRect();

    var pop = document.createElement("div");
    pop.className = "game-float-pop"
      + (data.bad ? " game-float-bad" : "")
      + (data.turtle ? " game-float-turtle" : "");

    if (data.turtle) {
      pop.textContent = "🐢 +5% Ưu đãi!";
    } else if (data.bad) {
      pop.textContent = data.points + "đ (-10k)";
    } else {
      pop.textContent = "+" + data.points + "đ (+" + data.points + "k)";
    }

    pop.style.left = (rect.left - oceanRect.left + 10) + "px";
    pop.style.top = (rect.top - oceanRect.top) + "px";
    layer.appendChild(pop);
    setTimeout(function () { pop.remove(); }, 950);
  }

  // 5. ĐỒNG HỒ & BẮT ĐẦU / KẾT THÚC
  function tickTimer() {
    timeLeft--;
    document.getElementById("game-time").textContent = timeLeft;
    if (timeLeft <= 0) endGame();
  }

  function startGame() {
    score = 0;
    turtlePercent = 0;
    timeLeft = GAME_DURATION;
    spawnInBatch = 0;
    turtleSlotInBatch = Math.floor(Math.random() * 10);
    gameRunning = true;

    updateHUD();
    document.getElementById("game-time").textContent = timeLeft;
    document.getElementById("game-start").style.display = "none";
    document.getElementById("game-end").style.display = "none";

    timerId = setInterval(tickTimer, 1000);
    spawnCreature();
  }

  function endGame() {
    gameRunning = false;
    clearInterval(timerId);
    clearTimeout(spawnTimeoutId);

    activeCreatures.forEach(function (entry) {
      entry.animation.cancel();
      entry.el.remove();
    });
    activeCreatures = [];

    var fixedDiscount = calcFixedDiscount(score);
    var best = getBestScore();
    var isNewBest = score > best;
    if (isNewBest) saveBestScore(score);

    document.getElementById("game-final-score").textContent = score;
    document.getElementById("game-final-reward").textContent = formatRewardSummary(fixedDiscount, turtlePercent);
    document.getElementById("game-new-best").style.display = isNewBest ? "block" : "none";
    document.getElementById("game-best").textContent = isNewBest ? score : best;

    var applyBtn = document.getElementById("game-apply-reward-btn");
    if (applyBtn) {
      var hasReward = fixedDiscount > 0 || turtlePercent > 0;
      applyBtn.style.display = hasReward ? "inline-flex" : "none";
      applyBtn.disabled = false;
      applyBtn.textContent = "🎟️ Lưu & Áp dụng ưu đãi vào giỏ hàng";
    }

    var nameBox = document.getElementById("game-name-box");
    if (nameBox) {
      if (score > 0 && qualifiesForLeaderboard(score)) {
        nameBox.style.display = "block";
        document.getElementById("game-name-input").value = "";
      } else {
        nameBox.style.display = "none";
      }
    }

    document.getElementById("game-end").style.display = "flex";
  }

  // 6. LƯU & ÁP DỤNG ƯU ĐÃI SANG GIỎ HÀNG
  function saveAndApplyGameReward() {
    var fixedDiscount = calcFixedDiscount(score);
    if (fixedDiscount <= 0 && turtlePercent <= 0) return;

    var reward = {
      code: "FISHING",
      score: score,
      fixed: fixedDiscount,
      percent: turtlePercent,
      savedAt: new Date().toLocaleString("vi-VN")
    };
    localStorage.setItem(REWARD_KEY, JSON.stringify(reward));
    localStorage.setItem("oceanSeafoodCoupon", "FISHING");
    renderSavedRewardBanner();

    if (window.fireConfetti) fireConfetti();
    if (window.SoundFX) SoundFX.playSuccess();
    if (typeof showToast === "function") {
      showToast("Đã lưu ưu đãi (" + formatRewardSummary(fixedDiscount, turtlePercent) + ") vào giỏ hàng!", "success");
    }

    var applyBtn = document.getElementById("game-apply-reward-btn");
    if (applyBtn) {
      applyBtn.textContent = "✅ Đã áp dụng vào giỏ hàng";
      applyBtn.disabled = true;
    }
  }

  function renderSavedRewardBanner() {
    var box = document.getElementById("saved-reward-text");
    if (!box) return;
    try {
      var raw = localStorage.getItem(REWARD_KEY);
      if (!raw) return;
      var reward = JSON.parse(raw);
      box.innerHTML = "<strong>" + formatRewardSummary(reward.fixed, reward.percent) + "</strong> (Mã <code>FISHING</code> đã sẵn sàng ở Giỏ hàng).";
    } catch (e) {}
  }

  // 7. KỶ LỤC & BẢNG HIỆU TOP 5 BÊN TRÁI
  function getBestScore() { return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0; }
  function saveBestScore(value) { localStorage.setItem(BEST_SCORE_KEY, String(value)); }

  function getLeaderboard() {
    try {
      var data = localStorage.getItem(LEADERBOARD_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  }

  function saveLeaderboard(list) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
  }

  function qualifiesForLeaderboard(points) {
    var list = getLeaderboard();
    return list.length < LEADERBOARD_SIZE || points > list[list.length - 1].score;
  }

  function addToLeaderboard(name, points, pct) {
    var list = getLeaderboard();
    list.push({
      name: (name || "").trim() || "Ẩn danh",
      score: points,
      fixed: calcFixedDiscount(points),
      percent: pct || 0,
      date: new Date().toLocaleDateString("vi-VN")
    });
    list.sort(function (a, b) { return b.score - a.score; });
    saveLeaderboard(list.slice(0, LEADERBOARD_SIZE));
    renderLeaderboard();
  }

  function renderLeaderboard() {
    var box = document.getElementById("game-leaderboard-list");
    if (!box) return;
    var list = getLeaderboard();
    if (list.length === 0) {
      box.innerHTML = '<li class="signboard-empty">Chưa có cao thủ ghi danh.<br>Hãy chơi 1 ván để mở bảng vàng!</li>';
      return;
    }
    var medals = ["🥇", "🥈", "🥉", "4", "5"];
    box.innerHTML = list.map(function (entry, idx) {
      var safeName = (typeof escapeHTML === "function") ? escapeHTML(entry.name) : entry.name;
      var rewardText = formatRewardSummary(entry.fixed != null ? entry.fixed : calcFixedDiscount(entry.score), entry.percent || 0);
      return (
        '<li class="signboard-row rank-' + (idx + 1) + '">' +
          '<span class="signboard-rank">' + (medals[idx] || (idx + 1)) + "</span>" +
          '<div class="signboard-info">' +
            '<span class="signboard-name">' + safeName + "</span>" +
            '<span class="signboard-meta">' + (entry.date || "Hôm nay") + "</span>" +
          "</div>" +
          '<div class="signboard-score">' +
            "<strong>" + entry.score + "đ</strong>" +
            "<small>" + rewardText + "</small>" +
          "</div>" +
        "</li>"
      );
    }).join("");
  }

  // 8. CHÚ GIẢI SINH VẬT
  function renderLegend() {
    var legend = document.getElementById("game-legend");
    if (!legend) return;
    var allItems = CREATURES.concat([TURTLE]);
    legend.innerHTML = allItems.map(function (c) {
      var cls = c.bad ? " legend-bad" : (c.turtle ? " legend-turtle" : "");
      return '<div class="game-legend-item' + cls + '">' +
        '<span class="legend-emoji">' + c.emoji + "</span>" +
        "<span>" + c.name + "</span>" +
        '<span class="legend-points">' + c.label + "</span>" +
      "</div>";
    }).join("");
  }

  // 9. KHỞI ĐỘNG
  document.addEventListener("DOMContentLoaded", function () {
    var ocean = document.getElementById("game-ocean");
    if (!ocean) return;

    document.getElementById("game-best").textContent = getBestScore();
    renderLegend();
    renderLeaderboard();
    renderSavedRewardBanner();

    // Tạo gợn sóng khi bấm vào mặt nước
    ocean.addEventListener("pointerdown", function (event) {
      if (!gameRunning) return;
      var rect = ocean.getBoundingClientRect();
      var ripple = document.createElement("span");
      ripple.className = "water-tap-ripple";
      ripple.style.left = (event.clientX - rect.left) + "px";
      ripple.style.top = (event.clientY - rect.top) + "px";
      ocean.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 550);
    });

    document.getElementById("game-start-btn").addEventListener("click", startGame);
    document.getElementById("game-restart-btn").addEventListener("click", startGame);
    document.getElementById("game-apply-reward-btn").addEventListener("click", saveAndApplyGameReward);

    var nameForm = document.getElementById("game-name-form");
    if (nameForm) {
      nameForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var name = document.getElementById("game-name-input").value;
        addToLeaderboard(name, score, turtlePercent);
        document.getElementById("game-name-box").style.display = "none";
      });
    }
  });

  window.addEventListener("beforeunload", function () {
    clearInterval(timerId);
    clearTimeout(spawnTimeoutId);
  });
})();
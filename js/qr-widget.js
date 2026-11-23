/* =====================================================
   OCEAN SEAFOOD - FILE: js/qr-widget.js
   Chức năng:
   1. Quét mã QR bằng Camera điện thoại / Ảnh có sẵn để nhận số bàn & gọi món
   2. Tạo & tải thẻ QR riêng cho từng bàn (để dán bàn hoặc test quét)
   ===================================================== */
(function () {
  var stream = null;
  var scanRafId = null;
  var scanning = false;
  var qrLibPromise = null;
  var jsQrPromise = null;

  function loadScriptOnce(src, checkFn) {
    if (checkFn()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", resolve);
        existing.addEventListener("error", reject);
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Không tải được thư viện: " + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureQRCodeLib() {
    if (!qrLibPromise) {
      qrLibPromise = loadScriptOnce(
        "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
        function () { return typeof window.QRCode === "function"; }
      );
    }
    return qrLibPromise;
  }

  function ensureJsQRLib() {
    if (!jsQrPromise) {
      jsQrPromise = loadScriptOnce(
        "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
        function () { return typeof window.jsQR === "function"; }
      );
    }
    return jsQrPromise;
  }

  function buildTableOrderUrl(tableCode) {
    var clean = typeof normalizeTableCode === "function" ? normalizeTableCode(tableCode) : String(tableCode || "01").trim();
    return new URL("menu.html?table=" + encodeURIComponent(clean), window.location.href).href;
  }

  function parseTableFromQr(rawText) {
    var text = String(rawText || "").trim();
    if (!text) return null;

    // 1. Trường hợp QR chứa URL (?table=05 hoặc ?ban=05)
    try {
      var url = new URL(text);
      var tableParam = url.searchParams.get("table") || url.searchParams.get("ban");
      if (tableParam) return { type: "table", table: tableParam, url: text };
      if (url.protocol === "http:" || url.protocol === "https:") {
        return { type: "url", url: text };
      }
    } catch (e) {
      // Không phải URL đầy đủ
    }

    // 2. Trường hợp QR chỉ chứa chữ như "BAN-05", "Bàn 5", "TABLE:05", "05"
    var match = text.match(/^(?:ban|bàn|table|ocean[\-_]?table)?[\s\-_:#]*([a-z0-9 ]{1,10})$/i);
    if (match && match[1]) {
      return { type: "table", table: match[1].trim() };
    }

    return { type: "text", text: text };
  }

  function goToTableMenu(tableCode) {
    var code = typeof setActiveTable === "function" ? setActiveTable(tableCode) : String(tableCode).trim();
    if (!code) return;
    stopCamera();
    closeModal();
    if (typeof showToast === "function") {
      showToast("🍽️ Đã nhận Bàn " + code + "! Đang mở thực đơn...", "success", 2500);
    }
    window.location.href = "menu.html?table=" + encodeURIComponent(code);
  }

  function handleDecodedText(rawText) {
    var parsed = parseTableFromQr(rawText);
    var statusEl = document.getElementById("qr-scan-status");
    if (!parsed) return false;

    if (parsed.type === "table") {
      goToTableMenu(parsed.table);
      return true;
    }

    if (parsed.type === "url") {
      stopCamera();
      if (statusEl) {
        statusEl.innerHTML =
          'Đã quét được liên kết: <a href="' + escapeHTML(parsed.url) +
          '" style="color:var(--color-primary);font-weight:700;text-decoration:underline">' +
          escapeHTML(parsed.url) + "</a>";
      }
      if (parsed.url.indexOf(window.location.origin) === 0) {
        window.location.href = parsed.url;
      }
      return true;
    }

    if (statusEl) {
      statusEl.textContent = "Nội dung QR: " + parsed.text + " (không chứa mã bàn OCEAN SEAFOOD).";
    }
    return false;
  }

  function stopCamera() {
    scanning = false;
    if (scanRafId) {
      cancelAnimationFrame(scanRafId);
      scanRafId = null;
    }
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    var video = document.getElementById("qr-video");
    if (video) video.srcObject = null;
    var placeholder = document.getElementById("qr-cam-placeholder");
    if (placeholder) placeholder.style.display = "flex";
    var startBtn = document.getElementById("qr-start-cam");
    if (startBtn) startBtn.textContent = "📷 Mở Camera quét mã";
  }

  function closeModal() {
    stopCamera();
    var modal = document.getElementById("qr-modal");
    if (modal) modal.classList.remove("qr-modal-open");
  }

  function startCameraScan() {
    var statusEl = document.getElementById("qr-scan-status");
    var video = document.getElementById("qr-video");
    var canvas = document.getElementById("qr-scan-canvas");
    var placeholder = document.getElementById("qr-cam-placeholder");
    var startBtn = document.getElementById("qr-start-cam");

    if (scanning) {
      stopCamera();
      if (statusEl) statusEl.textContent = "Đã tắt camera.";
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusEl) statusEl.textContent = "Trình duyệt chưa hỗ trợ camera trực tiếp. Hãy dùng nút Chọn ảnh QR hoặc mở trên HTTPS.";
      return;
    }

    if (statusEl) statusEl.textContent = "Đang khởi động camera...";

    Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false
      }),
      ("BarcodeDetector" in window) ? Promise.resolve() : ensureJsQRLib()
    ])
      .then(function (results) {
        stream = results[0];
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        return video.play();
      })
      .then(function () {
        scanning = true;
        if (placeholder) placeholder.style.display = "none";
        if (startBtn) startBtn.textContent = "⏹️ Tắt Camera";
        if (statusEl) statusEl.textContent = "Đưa mã QR trên bàn vào khung vuông để tự động nhận diện...";

        var detector = ("BarcodeDetector" in window)
          ? new window.BarcodeDetector({ formats: ["qr_code"] })
          : null;
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        var busy = false;

        function tick() {
          if (!scanning) return;
          if (video.readyState >= 2 && !busy) {
            if (detector) {
              busy = true;
              detector.detect(video)
                .then(function (codes) {
                  busy = false;
                  if (codes && codes.length > 0 && codes[0].rawValue) {
                    handleDecodedText(codes[0].rawValue);
                  }
                })
                .catch(function () {
                  busy = false;
                  detector = null;
                  ensureJsQRLib().catch(function () {});
                });
            } else if (typeof window.jsQR === "function") {
              var w = video.videoWidth;
              var h = video.videoHeight;
              if (w && h) {
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(video, 0, 0, w, h);
                var imgData = ctx.getImageData(0, 0, w, h);
                var code = window.jsQR(imgData.data, w, h, { inversionAttempts: "dontInvert" });
                if (code && code.data) {
                  handleDecodedText(code.data);
                  return;
                }
              }
            }
          }
          scanRafId = requestAnimationFrame(tick);
        }

        scanRafId = requestAnimationFrame(tick);
      })
      .catch(function () {
        stopCamera();
        if (statusEl) {
          statusEl.textContent = "Không mở được camera (hãy cấp quyền Camera hoặc dùng nút Chọn ảnh QR bên cạnh).";
        }
      });
  }

  function scanImageFile(file) {
    if (!file) return;
    var statusEl = document.getElementById("qr-scan-status");
    if (statusEl) statusEl.textContent = "Đang đọc mã QR từ ảnh...";

    ensureJsQRLib()
      .then(function () {
        var reader = new FileReader();
        reader.onload = function (ev) {
          var img = new Image();
          img.onload = function () {
            var canvas = document.getElementById("qr-scan-canvas");
            var maxSide = 900;
            var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var code = window.jsQR(imgData.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
            if (code && code.data) {
              handleDecodedText(code.data);
            } else if (statusEl) {
              statusEl.textContent = "Không tìm thấy mã QR rõ nét trong ảnh này. Thử ảnh khác nhé!";
            }
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      })
      .catch(function () {
        if (statusEl) statusEl.textContent = "Cần kết nối mạng để tải bộ giải mã QR từ ảnh.";
      });
  }

  function renderTableQR() {
    var select = document.getElementById("qr-table-select");
    var box = document.getElementById("qr-code-box");
    var urlPreview = document.getElementById("qr-table-url");
    var testBtn = document.getElementById("qr-open-table-btn");
    if (!select || !box) return;

    var table = select.value || "01";
    var url = buildTableOrderUrl(table);
    if (urlPreview) urlPreview.textContent = url;
    if (testBtn) testBtn.textContent = "🍽️ Test gọi món Bàn " + table;

    box.innerHTML = '<span style="font-size:0.85rem;color:var(--color-text-light)">Đang tạo mã QR...</span>';
    ensureQRCodeLib()
      .then(function () {
        box.innerHTML = "";
        new window.QRCode(box, {
          text: url,
          width: 190,
          height: 190,
          colorDark: "#062f57",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.M
        });
      })
      .catch(function () {
        box.innerHTML = '<p style="color:var(--color-danger);font-size:0.85rem">Không tải được thư viện tạo QR (cần mạng internet).</p>';
      });
  }

  function downloadTableCardPng() {
    var box = document.getElementById("qr-code-box");
    var select = document.getElementById("qr-table-select");
    if (!box || !select) return;

    var table = select.value || "01";
    var qrCanvas = box.querySelector("canvas");
    var qrImg = box.querySelector("img");

    function drawCard(source) {
      var card = document.createElement("canvas");
      card.width = 460;
      card.height = 580;
      var ctx = card.getContext("2d");

      // Nền thẻ trắng viền đại dương
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, card.width, card.height);

      ctx.fillStyle = "#0a4d8c";
      ctx.fillRect(0, 0, card.width, 118);

      ctx.fillStyle = "#e6c65c";
      ctx.fillRect(0, 118, card.width, 6);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("OCEAN SEAFOOD", card.width / 2, 54);

      ctx.font = "bold 22px Arial, sans-serif";
      ctx.fillStyle = "#e6c65c";
      ctx.fillText("BÀN " + table.toUpperCase(), card.width / 2, 94);

      // Khung QR ở giữa
      ctx.drawImage(source, (card.width - 280) / 2, 165, 280, 280);

      ctx.fillStyle = "#062f57";
      ctx.font = "bold 21px Arial, sans-serif";
      ctx.fillText("QUÉT MÃ ĐỂ ĐẶT MÓN", card.width / 2, 495);

      ctx.fillStyle = "#5a6b7c";
      ctx.font = "16px Arial, sans-serif";
      ctx.fillText("Mở Camera điện thoại & quét trực tiếp", card.width / 2, 530);

      var link = document.createElement("a");
      link.download = "QR-Ban-" + table + "-OCEAN-SEAFOOD.png";
      link.href = card.toDataURL("image/png");
      link.click();
      if (typeof showToast === "function") {
        showToast("Đã tải thẻ QR Bàn " + table + "!", "success");
      }
    }

    if (qrCanvas) {
      drawCard(qrCanvas);
    } else if (qrImg && qrImg.src) {
      var img = new Image();
      img.onload = function () { drawCard(img); };
      img.src = qrImg.src;
    }
  }

  function buildWidget() {
    if (document.getElementById("qr-fab")) return;

    var fab = document.createElement("button");
    fab.type = "button";
    fab.id = "qr-fab";
    fab.className = "qr-fab";
    fab.innerHTML = "📷";
    fab.title = "Quét mã QR gọi món tại bàn";
    fab.setAttribute("aria-label", "Quét mã QR gọi món tại bàn");
    document.body.appendChild(fab);

    var tableOptions = "";
    for (var i = 1; i <= 15; i++) {
      var num = i < 10 ? "0" + i : String(i);
      tableOptions += '<option value="' + num + '">Bàn ' + num + "</option>";
    }
    tableOptions += '<option value="VIP 1">Phòng VIP 1</option><option value="VIP 2">Phòng VIP 2</option>';

    var modal = document.createElement("div");
    modal.className = "qr-modal";
    modal.id = "qr-modal";
    modal.innerHTML =
      '<div class="qr-modal-box qr-modal-box-lg">' +
        '<button type="button" class="qr-modal-close" id="qr-modal-close" aria-label="Đóng">✕</button>' +
        '<h3>📱 Quét mã QR gọi món tại bàn</h3>' +
        '<div class="qr-tabs">' +
          '<button type="button" class="qr-tab-btn active" data-qr-tab="scan">📷 Quét QR đặt món</button>' +
          '<button type="button" class="qr-tab-btn" data-qr-tab="table">🏷️ Tạo &amp; In QR bàn</button>' +
        "</div>" +

        '<div class="qr-tab-panel active" id="qr-tab-scan">' +
          '<div class="qr-video-wrap">' +
            '<video id="qr-video" playsinline muted></video>' +
            '<div class="qr-scan-frame"><span class="qr-scan-line"></span></div>' +
            '<div class="qr-cam-placeholder" id="qr-cam-placeholder">' +
              "<span>📷</span>" +
              "<p>Bấm nút bên dưới để mở camera quét mã QR trên bàn ăn</p>" +
            "</div>" +
          "</div>" +
          '<canvas id="qr-scan-canvas" hidden></canvas>' +
          '<p class="qr-scan-status" id="qr-scan-status">Hỗ trợ quét trực tiếp bằng camera hoặc tải ảnh mã QR.</p>' +
          '<div class="qr-actions-row">' +
            '<button type="button" class="btn btn-primary btn-sm" id="qr-start-cam">📷 Mở Camera quét mã</button>' +
            '<label for="qr-file-input" class="btn btn-outline-blue btn-sm" style="cursor:pointer">🖼️ Chọn ảnh QR</label>' +
            '<input type="file" id="qr-file-input" accept="image/*" hidden>' +
          "</div>" +
          '<div class="qr-manual-box">' +
            '<input type="text" id="qr-manual-input" placeholder="Hoặc nhập số bàn (VD: 05, VIP 1)...">' +
            '<button type="button" class="btn btn-gold btn-sm" id="qr-manual-btn">Vào bàn</button>' +
          "</div>" +
        "</div>" +

        '<div class="qr-tab-panel" id="qr-tab-table">' +
          '<div class="qr-table-picker">' +
            '<label for="qr-table-select">Chọn bàn muốn tạo mã:</label>' +
            '<select id="qr-table-select">' + tableOptions + "</select>" +
          "</div>" +
          '<div id="qr-code-box"></div>' +
          '<p class="qr-table-url" id="qr-table-url"></p>' +
          '<div class="qr-actions-row">' +
            '<button type="button" class="btn btn-gold btn-sm" id="qr-open-table-btn">🍽️ Test gọi món Bàn 01</button>' +
            '<button type="button" class="btn btn-primary btn-sm" id="qr-download-card-btn">⬇️ Tải thẻ QR (PNG)</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(modal);

    // Chuyển tab
    modal.querySelectorAll(".qr-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-qr-tab");
        modal.querySelectorAll(".qr-tab-btn").forEach(function (b) { b.classList.remove("active"); });
        modal.querySelectorAll(".qr-tab-panel").forEach(function (p) { p.classList.remove("active"); });
        btn.classList.add("active");
        document.getElementById("qr-tab-" + tab).classList.add("active");
        if (tab === "table") {
          stopCamera();
          renderTableQR();
        }
      });
    });

    fab.addEventListener("click", function () {
      modal.classList.add("qr-modal-open");
      var activeTab = modal.querySelector(".qr-tab-btn.active");
      if (activeTab && activeTab.getAttribute("data-qr-tab") === "table") {
        renderTableQR();
      }
    });

    document.getElementById("qr-modal-close").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

    document.getElementById("qr-start-cam").addEventListener("click", startCameraScan);
    document.getElementById("qr-file-input").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        scanImageFile(e.target.files[0]);
      }
      e.target.value = "";
    });

    document.getElementById("qr-manual-btn").addEventListener("click", function () {
      var val = document.getElementById("qr-manual-input").value.trim();
      if (!val) {
        if (typeof showToast === "function") showToast("Vui lòng nhập số bàn!", "error");
        return;
      }
      goToTableMenu(val);
    });
    document.getElementById("qr-manual-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("qr-manual-btn").click();
      }
    });

    document.getElementById("qr-table-select").addEventListener("change", renderTableQR);
    document.getElementById("qr-open-table-btn").addEventListener("click", function () {
      goToTableMenu(document.getElementById("qr-table-select").value);
    });
    document.getElementById("qr-download-card-btn").addEventListener("click", downloadTableCardPng);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
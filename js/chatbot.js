/* =====================================================
   OCEAN SEAFOOD - FILE: js/chatbot.js
   Trợ lý AI 5 vai trò: Đầu bếp, Bồi bàn, Lễ tân, Bảo vệ, Về Web
   ===================================================== */
(function () {
  const HISTORY_KEY = "oceanSeafoodAiChatHistory";
  const BOT_NAME = "Sứa Tư Vấn AI";
  const CHAT_API_URL = "http://localhost:3000/api/chat";

  const ROLES = [
    { id: "", label: "Tự động" },
    { id: "Đầu bếp", label: "👨‍🍳 Đầu bếp" },
    { id: "Bồi bàn", label: "🍽️ Bồi bàn" },
    { id: "Lễ tân", label: "🛎️ Lễ tân" },
    { id: "Bảo vệ", label: "🛡️ Bảo vệ" },
    { id: "Hướng dẫn Web", label: "🌐 Về Web" },
  ];

  const QUICK_CHIPS = [
    { text: "Gợi ý thực đơn cho 4 người", role: "Bồi bàn" },
    { text: "Món tôm hùm chế biến thế nào?", role: "Đầu bếp" },
    { text: "Đặt bàn & ưu đãi hôm nay", role: "Lễ tân" },
    { text: "Nhà hàng có chỗ gửi xe an toàn không?", role: "Bảo vệ" },
    { text: "Web này có những tính năng gì hay?", role: "Hướng dẫn Web" },
  ];

  let activeRole = "";
  let isWaiting = false;

  function collectSiteContext() {
    const info = typeof RESTAURANT_INFO !== "undefined" ? RESTAURANT_INFO : null;
    const categories =
      typeof CATEGORIES !== "undefined"
        ? CATEGORIES.map(function (c) { return { id: c.id, name: c.name }; })
        : [];
    const products =
      typeof PRODUCTS !== "undefined"
        ? PRODUCTS.map(function (p) {
            return {
              id: p.id,
              name: p.name,
              price: typeof formatPrice === "function" ? formatPrice(p.price) : p.price + "đ",
              category: p.category,
              bestSeller: !!p.bestSeller,
              inStock: p.inStock !== false,
            };
          })
        : [];

    return {
      restaurant: info,
      categories: categories,
      menu: products,
      coupons: [
        "OCEAN10 (giảm 10% mọi đơn)",
        "WELCOME50 (giảm 50.000đ đơn từ 300.000đ)",
        "FAMILY100 (giảm 100.000đ đơn từ 1.000.000đ)",
        "FISHING (săn điểm đổi tiền + Rùa biển 5% tại Phòng chờ fishing-game.html)",
        "LUCKY20 (quay trúng ở Vòng quay may mắn)",
      ],
    };
  }

  function getHistory() {
    try {
      const data = sessionStorage.getItem(HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  function saveHistory(history) {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-24)));
  }

  function formatSafeText(text) {
    const escaped = typeof escapeHTML === "function" ? escapeHTML(text) : String(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function buildWidget() {
    const wrap = document.createElement("div");
    wrap.className = "chatbot-wrap";
    wrap.innerHTML = `
      <button type="button" class="chatbot-toggle" id="chatbot-toggle" aria-label="Mở trợ lý AI">
        <span class="chatbot-toggle-icon">🪼</span>
        <span class="chatbot-ping"></span>
      </button>
      <div class="chatbot-panel" id="chatbot-panel">
        <div class="chatbot-header">
          <span class="chatbot-avatar">🪼</span>
          <div>
            <strong>${BOT_NAME}</strong>
            <small>Đầu bếp · Lễ tân · Bồi bàn · Bảo vệ</small>
          </div>
          <button type="button" class="chatbot-clear" id="chatbot-clear" title="Xóa đoạn chat" aria-label="Xóa đoạn chat">🗑</button>
          <button type="button" class="chatbot-close" id="chatbot-close" aria-label="Đóng">✕</button>
        </div>
        <div class="chatbot-roles" id="chatbot-roles"></div>
        <div class="chatbot-messages" id="chatbot-messages"></div>
        <div class="chatbot-chips" id="chatbot-chips"></div>
        <form class="chatbot-input" id="chatbot-form">
          <input type="text" id="chatbot-text" placeholder="Hỏi món ăn, bếp, đặt bàn, giữ xe, web..." autocomplete="off">
          <button type="submit" id="chatbot-send" aria-label="Gửi">➤</button>
        </form>
      </div>`;
    document.body.appendChild(wrap);
  }

  function renderRoles() {
    const box = document.getElementById("chatbot-roles");
    if (!box) return;
    box.innerHTML = ROLES.map(function (r) {
      const cls = r.id === activeRole ? " active" : "";
      return '<button type="button" class="chatbot-role-btn' + cls + '" data-role="' + r.id + '">' + r.label + "</button>";
    }).join("");

    box.querySelectorAll(".chatbot-role-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeRole = btn.dataset.role;
        renderRoles();
      });
    });
  }

  function renderChips() {
    const chipsBox = document.getElementById("chatbot-chips");
    if (!chipsBox) return;
    chipsBox.innerHTML = QUICK_CHIPS.map(function (chip, idx) {
      return '<button type="button" class="chatbot-chip" data-idx="' + idx + '">' + chip.text + "</button>";
    }).join("");

    chipsBox.querySelectorAll(".chatbot-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const item = QUICK_CHIPS[Number(btn.dataset.idx)];
        if (!item || isWaiting) return;
        sendToAI(item.text, item.role);
      });
    });
  }

  function renderMessage(text, sender, roleBadge, isError) {
    const box = document.getElementById("chatbot-messages");
    if (!box) return;

    const row = document.createElement("div");
    row.className = "chatbot-row chatbot-row-" + sender;

    const badgeHTML =
      sender === "bot" && roleBadge
        ? '<span class="chatbot-role-tag">' + formatSafeText(roleBadge) + "</span>"
        : "";
    const errClass = isError ? " chatbot-bubble-error" : "";

    row.innerHTML =
      '<div class="chatbot-bubble' + errClass + '">' +
        badgeHTML +
        "<div>" + formatSafeText(text) + "</div>" +
      "</div>";

    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function renderLinkButton(link) {
    if (!link || !link.href || !link.text) return;
    const box = document.getElementById("chatbot-messages");
    if (!box) return;

    const safeHref = typeof escapeHTML === "function" ? escapeHTML(link.href) : link.href;
    const safeText = typeof escapeHTML === "function" ? escapeHTML(link.text) : link.text;

    const row = document.createElement("div");
    row.className = "chatbot-row chatbot-row-bot";
    row.innerHTML = '<a class="chatbot-link-btn" href="' + safeHref + '">' + safeText + " →</a>";
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function renderTyping() {
    const box = document.getElementById("chatbot-messages");
    const row = document.createElement("div");
    row.className = "chatbot-row chatbot-row-bot chatbot-typing-row";
    row.innerHTML = '<div class="chatbot-bubble chatbot-typing"><span></span><span></span><span></span></div>';
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
  }

  async function sendToAI(userText, explicitRole) {
    if (isWaiting) return;
    isWaiting = true;

    const sendBtn = document.getElementById("chatbot-send");
    if (sendBtn) sendBtn.disabled = true;

    renderMessage(userText, "user");
    const currentHistory = getHistory();
    saveHistory(currentHistory.concat([{ sender: "user", text: userText }]));

    const typingRow = renderTyping();

    try {
      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          roleHint: explicitRole || activeRole,
          history: currentHistory,
          siteContext: collectSiteContext(),
        }),
      });

      const data = await response.json();
      typingRow.remove();

      if (!response.ok) {
        renderMessage(data.error || "Không thể kết nối tới trợ lý AI.", "bot", "Hệ thống", true);
        return;
      }

      renderMessage(data.reply, "bot", data.roleBadge);
      if (data.link) renderLinkButton(data.link);

      saveHistory(
        getHistory().concat([
          { sender: "bot", text: data.reply, roleBadge: data.roleBadge, link: data.link || null },
        ])
      );
    } catch (error) {
      typingRow.remove();
      renderMessage(
        "Chưa kết nối được máy chủ AI (" + CHAT_API_URL + "). Vui lòng kiểm tra node server.js đã chạy chưa.",
        "bot",
        "Hệ thống",
        true
      );
    } finally {
      isWaiting = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildWidget();
    renderRoles();
    renderChips();

    const toggle = document.getElementById("chatbot-toggle");
    const panel = document.getElementById("chatbot-panel");
    const closeBtn = document.getElementById("chatbot-close");
    const clearBtn = document.getElementById("chatbot-clear");
    const form = document.getElementById("chatbot-form");
    const textInput = document.getElementById("chatbot-text");
    const messagesBox = document.getElementById("chatbot-messages");

    const history = getHistory();
    if (history.length) {
      history.forEach(function (msg) {
        renderMessage(msg.text, msg.sender, msg.roleBadge);
        if (msg.link) renderLinkButton(msg.link);
      });
    } else {
      renderMessage(
        "Xin chào! Mình là **Sứa Tư Vấn AI** 🪼 của OCEAN SEAFOOD. Mình có thể tư vấn món ăn (Đầu bếp/Bồi bàn), hỗ trợ đặt bàn (Lễ tân), hướng dẫn gửi xe & an toàn (Bảo vệ) hoặc giới thiệu tính năng website!",
        "bot",
        "Lễ tân"
      );
    }

    toggle.addEventListener("click", function () {
      const isOpen = panel.classList.toggle("chatbot-open");
      toggle.classList.toggle("chatbot-toggle-hide", isOpen);
      if (isOpen) textInput.focus();
    });

    closeBtn.addEventListener("click", function () {
      panel.classList.remove("chatbot-open");
      toggle.classList.remove("chatbot-toggle-hide");
    });

    clearBtn.addEventListener("click", function () {
      sessionStorage.removeItem(HISTORY_KEY);
      messagesBox.innerHTML = "";
      renderMessage("Đã làm mới cuộc trò chuyện. Bạn cần mình hỗ trợ điều gì nào?", "bot", "Lễ tân");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const value = textInput.value.trim();
      if (!value || isWaiting) return;
      textInput.value = "";
      sendToAI(value);
    });
  });
})();
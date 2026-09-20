const KEYS = { cart: "bks_cart", customer: "bks_customer" };
const $ = (id) => document.getElementById(id);

let products = [];
let settings = {
  storeName: "Babbu Karyana Store",
  deliveryMins: "20-30",
  freeDeliveryAbove: 299,
  deliveryFee: 20,
  ownerPhone: "",
};
let smtpReady = false;
let activeCategory = "all";
let searchTerm = "";
let adminOrders = [];
let adminStats = null;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getCart() {
  return load(KEYS.cart, {});
}

function getCustomer() {
  return load(KEYS.customer, null);
}

function money(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function showScreen(id) {
  [
    "screen-login",
    "screen-shop",
    "screen-cart",
    "screen-success",
    "screen-admin-login",
    "screen-admin",
  ].forEach((screen) => $(screen).classList.toggle("app-hidden", screen !== id));
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request fail ho gayi");
  return data;
}

async function loadCatalog() {
  const data = await api("/api/catalog");
  products = data.products || [];
  settings = { ...settings, ...data.settings };
  smtpReady = Boolean(data.smtpReady);
}

function cartCount() {
  return Object.values(getCart()).reduce((sum, qty) => sum + qty, 0);
}

function cartTotal() {
  const cart = getCart();
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const product = products.find((item) => item.id === id);
    return product ? sum + product.price * qty : sum;
  }, 0);
}

function deliveryFee() {
  return cartTotal() >= Number(settings.freeDeliveryAbove) ? 0 : Number(settings.deliveryFee);
}

function qtyOf(id) {
  return getCart()[id] || 0;
}

function setQty(id, qty) {
  const cart = getCart();
  if (qty <= 0) delete cart[id];
  else cart[id] = qty;
  save(KEYS.cart, cart);
  renderShop();
  renderCart();
}

function thumbHtml(product, cls) {
  if (product.image_url) {
    return `<div class="${cls} thumb-photo"><img src="${product.image_url}" alt="" /></div>`;
  }
  return `<div class="${cls}">${product.emoji || "🛒"}</div>`;
}

function productCard(product) {
  const qty = qtyOf(product.id);
  const controls =
    qty === 0
      ? `<button class="add-btn" data-add="${product.id}">ADD</button>`
      : `<div class="stepper">
           <button data-dec="${product.id}">−</button>
           <span>${qty}</span>
           <button data-inc="${product.id}">+</button>
         </div>`;
  const tag = product.tag ? `<span class="tag">${product.tag}</span>` : "";
  const mrp =
    product.mrp && product.mrp > product.price
      ? `<span class="mrp">${money(product.mrp)}</span>`
      : "";
  return `<article class="card">
    ${thumbHtml(product, "thumb")}
    ${tag}
    <h3>${product.name}</h3>
    <div class="unit">${product.unit}</div>
    <div class="card-foot">
      <div class="price">${money(product.price)}${mrp}</div>
      ${controls}
    </div>
  </article>`;
}

function renderShop() {
  if ($("screen-shop").classList.contains("app-hidden")) {
    updateCartBadges();
    return;
  }
  const customer = getCustomer();
  $("delivery-line").textContent = `${settings.deliveryMins} min mein delivery`;
  $("hero-pill").textContent = `Free delivery ₹${settings.freeDeliveryAbove}+`;
  $("user-chip").textContent = customer ? `Hi, ${customer.name.split(" ")[0]}` : "";
  $("cats").innerHTML = CATEGORIES.map(
    (cat) =>
      `<button class="cat ${cat.id === activeCategory ? "active" : ""}" data-cat="${cat.id}">${cat.emoji} ${cat.name}</button>`
  ).join("");

  const filtered = products.filter((product) => {
    const catOk = activeCategory === "all" || product.category === activeCategory;
    const q = searchTerm.trim().toLowerCase();
    const searchOk = !q || product.name.toLowerCase().includes(q) || product.unit.toLowerCase().includes(q);
    return catOk && searchOk;
  });
  $("product-grid").innerHTML = filtered.length
    ? filtered.map(productCard).join("")
    : `<div class="empty">Is search pe koi product nahi mila.</div>`;
  updateCartBadges();
}

function updateCartBadges() {
  const count = cartCount();
  $("header-badge").textContent = count;
  $("header-badge").classList.toggle("app-hidden", count === 0);
  const floatCart = $("float-cart");
  if (count === 0) floatCart.classList.add("app-hidden");
  else {
    floatCart.classList.remove("app-hidden");
    floatCart.innerHTML = `<span>${count} items</span><span>${money(cartTotal())} · View cart →</span>`;
  }
}

function renderCart() {
  if ($("screen-cart").classList.contains("app-hidden")) return;
  const cart = getCart();
  const items = Object.entries(cart)
    .map(([id, qty]) => {
      const product = products.find((item) => item.id === id);
      if (!product) return "";
      return `<div class="cart-item">
        ${thumbHtml(product, "mini-thumb")}
        <div>
          <strong>${product.name}</strong>
          <div class="unit">${product.unit} · ${money(product.price)}</div>
          <div class="stepper" style="margin-top:8px;width:96px">
            <button data-dec="${product.id}">−</button>
            <span>${qty}</span>
            <button data-inc="${product.id}">+</button>
          </div>
        </div>
        <strong>${money(product.price * qty)}</strong>
      </div>`;
    })
    .join("");
  $("cart-items").innerHTML = items || `<div class="empty">Cart khali hai. Pehle saman add karo.</div>`;
  const sub = cartTotal();
  const fee = deliveryFee();
  $("bill").innerHTML = `
    <div class="bill-row"><span>Item total</span><span>${money(sub)}</span></div>
    <div class="bill-row"><span>Delivery</span><span>${fee ? money(fee) : "FREE"}</span></div>
    <div class="bill-row total"><span>To pay</span><span>${money(sub + fee)}</span></div>
  `;
  const customer = getCustomer() || {};
  if (!$("order-name").value) $("order-name").value = customer.name || "";
  if (!$("order-phone").value) $("order-phone").value = customer.phone || "";
  updateCartBadges();
}

function statusLabel(status) {
  return { new: "Naya", confirmed: "Call ho gaya", delivered: "Delivered", cancelled: "Cancel" }[status] || status;
}

function renderAdmin() {
  $("admin-products").innerHTML = products
    .map(
      (product) => `<div class="product-admin">
        <div><strong>${product.emoji || "🛒"} ${product.name}</strong><div class="unit">${product.unit} · ${money(product.price)}</div></div>
        <span class="status">${product.category}</span>
        <div class="admin-actions">
          <button class="edit-btn" data-edit="${product.id}">Edit</button>
          <button class="danger" data-del="${product.id}">Remove</button>
        </div>
      </div>`
    )
    .join("");

  $("order-count").textContent = adminOrders.length ? `(${adminOrders.length})` : "";
  $("admin-orders").innerHTML = adminOrders.length
    ? adminOrders
        .map(
          (order) => `<article class="order-card">
            <div class="order-head">
              <h3>Order #${order.id} · ${money(order.total)}</h3>
              <span class="status status-${order.status}">${statusLabel(order.status)}</span>
            </div>
            <p><strong>${order.customer_name}</strong> · <a href="tel:${order.phone}">${order.phone}</a></p>
            <p>${order.address}</p>
            <p class="unit">${order.items_text}</p>
            ${order.note ? `<p>Note: ${order.note}</p>` : ""}
            <p class="hint">${order.time}${order.email_sent ? " · Email gayi" : ""}</p>
            <div class="order-actions">
              <button data-oid="${order.id}" data-status="confirmed">Call ho gaya</button>
              <button data-oid="${order.id}" data-status="delivered">Delivered</button>
              <button data-oid="${order.id}" data-status="cancelled">Cancel</button>
              <a class="call-link" href="tel:${order.phone}">Call karo</a>
            </div>
          </article>`
        )
        .join("")
    : `<div class="empty">Abhi koi order nahi aaya.</div>`;

  if (adminStats) {
    $("admin-stats").innerHTML = `
      <div class="stat"><b>${adminStats.todayOrders}</b><span>Aaj ke orders</span></div>
      <div class="stat"><b>${money(adminStats.todayRevenue)}</b><span>Aaj ki sale</span></div>
      <div class="stat"><b>${adminStats.pending}</b><span>Pending</span></div>
      <div class="stat"><b>${money(adminStats.totalRevenue)}</b><span>Total sale</span></div>
    `;
  }

  $("s-email").value = settings.ownerEmail || "";
  $("s-phone").value = settings.ownerPhone || "";
  $("s-free").value = settings.freeDeliveryAbove;
  $("s-fee").value = settings.deliveryFee;
  $("s-mins").value = settings.deliveryMins;
  $("smtp-status").textContent = smtpReady
    ? "SMTP ready hai — orders pe email jaayegi."
    : ".env mein SMTP_USER aur Gmail App Password daalo, tabhi asli email jaayegi. Orders phir bhi save honge.";
}

function fillCategorySelect() {
  $("p-category").innerHTML = CATEGORIES.filter((cat) => cat.id !== "all")
    .map((cat) => `<option value="${cat.id}">${cat.name}</option>`)
    .join("");
}

function resetProductForm() {
  $("p-id").value = "";
  $("add-product-form").reset();
  $("p-emoji").value = "🛒";
  $("product-form-title").textContent = "Naya product add karo";
  $("product-save-btn").textContent = "Product add karo";
  $("product-cancel").classList.add("app-hidden");
}

function fillProductForm(product) {
  $("p-id").value = product.id;
  $("p-name").value = product.name;
  $("p-category").value = product.category;
  $("p-unit").value = product.unit;
  $("p-price").value = product.price;
  $("p-mrp").value = product.mrp;
  $("p-emoji").value = product.emoji || "🛒";
  $("p-tag").value = product.tag || "";
  $("p-image").value = product.image_url || "";
  $("product-form-title").textContent = "Product edit karo";
  $("product-save-btn").textContent = "Save changes";
  $("product-cancel").classList.remove("app-hidden");
}

async function refreshAdmin() {
  await loadCatalog();
  const me = await api("/api/admin/me");
  const orders = await api("/api/admin/orders");
  settings = { ...settings, ...me.settings };
  smtpReady = Boolean(me.smtpReady);
  adminStats = me.stats;
  adminOrders = orders.orders || [];
  renderAdmin();
}

function bindEvents() {
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("customer-name").value.trim();
    const phone = $("customer-phone").value.replace(/\D/g, "");
    if (phone.length !== 10) return toast("Sahi 10 digit mobile number daaliye");
    save(KEYS.customer, { name, phone });
    await loadCatalog();
    showScreen("screen-shop");
    renderShop();
  });

  $("open-admin").addEventListener("click", () => showScreen("screen-admin-login"));
  $("back-login").addEventListener("click", () => showScreen("screen-login"));

  $("search").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderShop();
  });

  $("cats").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    renderShop();
  });

  document.body.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-add]");
    const inc = e.target.closest("[data-inc]");
    const dec = e.target.closest("[data-dec]");
    const del = e.target.closest("[data-del]");
    const edit = e.target.closest("[data-edit]");
    const statusBtn = e.target.closest("[data-status][data-oid]");
    if (add) setQty(add.dataset.add, qtyOf(add.dataset.add) + 1);
    if (inc) setQty(inc.dataset.inc, qtyOf(inc.dataset.inc) + 1);
    if (dec) setQty(dec.dataset.dec, qtyOf(dec.dataset.dec) - 1);
    if (edit) {
      const product = products.find((item) => item.id === edit.dataset.edit);
      if (product) {
        fillProductForm(product);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    if (del) {
      if (!confirm("Yeh product hataana hai?")) return;
      try {
        await api("/api/admin/products/" + del.dataset.del, { method: "DELETE" });
        await loadCatalog();
        renderAdmin();
        toast("Product hata diya");
      } catch (err) {
        toast(err.message);
      }
    }
    if (statusBtn) {
      try {
        await api("/api/admin/orders/" + statusBtn.dataset.oid, {
          method: "PATCH",
          body: { status: statusBtn.dataset.status },
        });
        await refreshAdmin();
        toast("Order status update ho gaya");
      } catch (err) {
        toast(err.message);
      }
    }
  });

  $("header-cart").addEventListener("click", openCart);
  $("float-cart").addEventListener("click", openCart);
  $("back-shop").addEventListener("click", () => {
    showScreen("screen-shop");
    renderShop();
  });

  $("checkout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!cartCount()) return toast("Pehle cart mein saman daaliye");
    const name = $("order-name").value.trim();
    const phone = $("order-phone").value.replace(/\D/g, "");
    const address = $("order-address").value.trim();
    const note = $("order-note").value.trim();
    if (phone.length !== 10) return toast("Sahi mobile number daaliye");
    const btn = $("buy-btn");
    btn.disabled = true;
    btn.textContent = "Order ja raha hai...";
    try {
      const cart = getCart();
      const result = await api("/api/orders", {
        method: "POST",
        body: {
          name,
          phone,
          address,
          note,
          items: Object.entries(cart).map(([id, qty]) => ({ id, qty })),
        },
      });
      save(KEYS.customer, { name, phone });
      save(KEYS.cart, {});
      $("order-address").value = "";
      $("order-note").value = "";
      $("success-text").textContent =
        "Dukaan wale ko order mil gaya hai. Woh aapko call karke confirm karenge aur saman ghar pahuncha denge.";
      $("success-meta").textContent = result.emailed
        ? `Order #${result.order.id} · ${money(result.order.total)} · Email bhej di gayi`
        : `Order #${result.order.id} · ${money(result.order.total)} · Admin dashboard pe save ho gaya${result.mailReason ? " (" + result.mailReason + ")" : ""}`;
      showScreen("screen-success");
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Buy now / Order kar do";
    }
  });

  $("shop-again").addEventListener("click", async () => {
    await loadCatalog();
    showScreen("screen-shop");
    renderShop();
  });
  $("logout-btn").addEventListener("click", () => {
    localStorage.removeItem(KEYS.customer);
    showScreen("screen-login");
  });

  $("admin-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/login", { method: "POST", body: { pin: $("admin-pin").value.trim() } });
      fillCategorySelect();
      await refreshAdmin();
      showScreen("screen-admin");
    } catch (err) {
      toast(err.message);
    }
  });

  $("admin-logout").addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    showScreen("screen-login");
  });

  document.querySelector(".admin-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    document.querySelectorAll(".admin-tabs button").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
    ["products", "orders", "settings"].forEach((tab) => {
      $("tab-" + tab).classList.toggle("app-hidden", tab !== btn.dataset.tab);
    });
  });

  $("add-product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      name: $("p-name").value.trim(),
      category: $("p-category").value,
      unit: $("p-unit").value.trim(),
      price: Number($("p-price").value),
      mrp: Number($("p-mrp").value),
      emoji: $("p-emoji").value.trim() || "🛒",
      tag: $("p-tag").value.trim(),
      image_url: $("p-image").value.trim(),
    };
    const id = $("p-id").value;
    try {
      if (id) await api("/api/admin/products/" + id, { method: "PUT", body: payload });
      else await api("/api/admin/products", { method: "POST", body: payload });
      resetProductForm();
      await loadCatalog();
      renderAdmin();
      toast(id ? "Product update ho gaya" : "Product add ho gaya");
    } catch (err) {
      toast(err.message);
    }
  });

  $("product-cancel").addEventListener("click", resetProductForm);

  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await api("/api/admin/settings", {
        method: "PUT",
        body: {
          ownerEmail: $("s-email").value.trim(),
          ownerPhone: $("s-phone").value.replace(/\D/g, ""),
          freeDeliveryAbove: Number($("s-free").value),
          deliveryFee: Number($("s-fee").value),
          deliveryMins: $("s-mins").value.trim(),
          adminPin: $("s-pin").value.trim(),
        },
      });
      settings = { ...settings, ...data.settings };
      $("s-pin").value = "";
      toast("Settings save ho gayi");
    } catch (err) {
      toast(err.message);
    }
  });

  $("test-email").addEventListener("click", async () => {
    try {
      await api("/api/admin/test-email", { method: "POST", body: { email: $("s-email").value.trim() } });
      toast("Test email bhej di");
    } catch (err) {
      toast(err.message);
    }
  });
}

function openCart() {
  if (!cartCount()) return toast("Cart abhi khali hai");
  showScreen("screen-cart");
  renderCart();
}

async function boot() {
  if (location.protocol === "file:") {
    $("file-warning").classList.remove("app-hidden");
    $("screen-login").classList.add("app-hidden");
    return;
  }
  bindEvents();
  fillCategorySelect();
  try {
    await loadCatalog();
  } catch {
    toast("Server se connect nahi hua. start.bat chalao.");
  }
  try {
    const me = await api("/api/admin/me");
    fillCategorySelect();
    settings = { ...settings, ...me.settings };
    smtpReady = Boolean(me.smtpReady);
    adminStats = me.stats;
    const orders = await api("/api/admin/orders");
    adminOrders = orders.orders || [];
    showScreen("screen-admin");
    renderAdmin();
    return;
  } catch {
    /* customer flow */
  }
  const customer = getCustomer();
  if (customer) {
    $("customer-name").value = customer.name;
    $("customer-phone").value = customer.phone;
    showScreen("screen-shop");
    renderShop();
    return;
  }
  showScreen("screen-login");
}

boot();

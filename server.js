require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const db = require("./db");
const mailer = require("./mailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ALLOWED_STATUS = new Set(["new", "confirmed", "delivered", "cancelled"]);

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

function cookieOpts(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "");
  const secure = Boolean(req.secure) || forwarded.includes("https");
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));

function requireAdmin(req, res, next) {
  if (!db.validSession(req.cookies.admin_token)) {
    return res.status(401).json({ error: "Admin login chahiye" });
  }
  next();
}

function productPayload(body) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const unit = String(body.unit || "").trim();
  const price = Number(body.price);
  const mrp = Number(body.mrp || body.price);
  if (!name || !category || !unit || !price || price < 1) {
    throw new Error("Product name, category, unit aur price zaroori hain");
  }
  return {
    name,
    category,
    unit,
    price,
    mrp: mrp >= price ? mrp : price,
    emoji: String(body.emoji || "🛒").trim() || "🛒",
    tag: String(body.tag || "").trim(),
    image_url: String(body.image_url || "").trim(),
  };
}

app.get("/api/catalog", (req, res) => {
  const settings = db.getSettings();
  res.json({
    products: db.listProducts(),
    settings: {
      storeName: settings.storeName,
      deliveryMins: settings.deliveryMins,
      freeDeliveryAbove: settings.freeDeliveryAbove,
      deliveryFee: settings.deliveryFee,
      ownerPhone: settings.ownerPhone,
    },
    smtpReady: mailer.canSend(),
  });
});

app.post("/api/orders", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    const address = String(req.body.address || "").trim();
    const note = String(req.body.note || "").trim();
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!name || phone.length !== 10 || !address) {
      return res.status(400).json({ error: "Naam, 10 digit mobile aur address zaroori hain" });
    }
    if (!items.length) return res.status(400).json({ error: "Cart khali hai" });

    const settings = db.getSettings();
    const lines = [];
    let subtotal = 0;
    for (const item of items) {
      const product = db.getProduct(item.id);
      const qty = Number(item.qty);
      if (!product || !qty || qty < 1) continue;
      subtotal += product.price * qty;
      lines.push({
        id: product.id,
        name: product.name,
        unit: product.unit,
        price: product.price,
        qty,
      });
    }
    if (!lines.length) return res.status(400).json({ error: "Sahi products select karo" });

    const deliveryFee = subtotal >= settings.freeDeliveryAbove ? 0 : settings.deliveryFee;
    const order = {
      id: String(Date.now()).slice(-6),
      customer_name: name,
      phone,
      address,
      note,
      items: lines,
      items_text: lines.map((line) => `${line.name} (${line.unit}) x${line.qty}`).join(", "),
      subtotal,
      delivery_fee: deliveryFee,
      total: subtotal + deliveryFee,
      email_sent: false,
    };

    db.createOrder(order);
    res.json({
      order: db.getOrder(order.id),
      emailed: mailer.canSend() && Boolean(settings.ownerEmail),
    });

    mailer
      .sendOrderEmail(settings.ownerEmail, order)
      .then((mail) => {
        if (mail.sent) db.markEmailSent(order.id);
        else console.log("Order email skip", order.id, mail.reason || "");
      })
      .catch((err) => console.error("Order email fail", order.id, err.message));
  } catch (err) {
    res.status(500).json({ error: err.message || "Order save nahi hua" });
  }
});

app.post("/api/admin/login", (req, res) => {
  const pin = String(req.body.pin || "").trim();
  const admin = db.getAdminSettings();
  if (!pin || db.hashPin(pin) !== admin.adminPinHash) {
    return res.status(401).json({ error: "Galat PIN" });
  }
  const session = db.createSession();
  res.cookie("admin_token", session.token, cookieOpts(req));
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  db.destroySession(req.cookies.admin_token);
  res.clearCookie("admin_token");
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ ok: true, settings: db.getSettings(), stats: db.stats(), smtpReady: mailer.canSend() });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  res.json({ orders: db.listOrders(), stats: db.stats() });
});

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const status = String(req.body.status || "");
  if (!ALLOWED_STATUS.has(status)) return res.status(400).json({ error: "Galat status" });
  const order = db.updateOrderStatus(req.params.id, status);
  if (!order) return res.status(404).json({ error: "Order nahi mila" });
  res.json({ order });
});

app.post("/api/admin/products", requireAdmin, (req, res) => {
  try {
    res.json({ product: db.createProduct(productPayload(req.body)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  try {
    if (!db.getProduct(req.params.id)) return res.status(404).json({ error: "Product nahi mila" });
    res.json({ product: db.updateProduct(req.params.id, productPayload(req.body)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.deleteProduct(req.params.id);
  res.json({ ok: true });
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const ownerEmail = String(req.body.ownerEmail || "").trim();
  const ownerPhone = String(req.body.ownerPhone || "").replace(/\D/g, "");
  const deliveryMins = String(req.body.deliveryMins || "20-30").trim();
  const freeDeliveryAbove = Number(req.body.freeDeliveryAbove);
  const deliveryFee = Number(req.body.deliveryFee);
  db.setSetting("ownerEmail", ownerEmail);
  db.setSetting("ownerPhone", ownerPhone);
  db.setSetting("deliveryMins", deliveryMins || "20-30");
  if (!Number.isNaN(freeDeliveryAbove)) db.setSetting("freeDeliveryAbove", freeDeliveryAbove);
  if (!Number.isNaN(deliveryFee)) db.setSetting("deliveryFee", deliveryFee);
  const newPin = String(req.body.adminPin || "").trim();
  if (newPin) db.setSetting("adminPinHash", db.hashPin(newPin));
  res.json({ settings: db.getSettings() });
});

app.post("/api/admin/test-email", requireAdmin, async (req, res) => {
  try {
    const to = String(req.body.email || db.getSettings().ownerEmail || "").trim();
    await mailer.sendTestEmail(to);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Babbu Karyana Store: http://localhost:${PORT}`);
});

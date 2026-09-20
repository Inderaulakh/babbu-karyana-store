const nodemailer = require("nodemailer");

function money(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function smtpPass() {
  return String(process.env.SMTP_PASS || "").replace(/\s/g, "");
}

function canSend() {
  return Boolean(process.env.SMTP_USER && smtpPass()) || Boolean(process.env.OWNER_EMAIL);
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    requireTLS: Number(process.env.SMTP_PORT || 465) !== 465,
    family: 4,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPass(),
    },
  });
}

function orderText(order) {
  return [
    `Naya order #${order.id}`,
    `Naam: ${order.customer_name}`,
    `Mobile: ${order.phone}`,
    `Address: ${order.address}`,
    `Items: ${order.items_text}`,
    `Total: ${money(order.total)}`,
    order.note ? `Note: ${order.note}` : "",
    "Customer ko call karke confirm karo aur saman ghar pahuncha do.",
  ]
    .filter(Boolean)
    .join("\n");
}

function orderHtml(order) {
  return `
      <div style="font-family:Arial,sans-serif;max-width:560px">
        <h2>Naya order #${order.id}</h2>
        <p><b>Naam:</b> ${order.customer_name}<br/>
        <b>Mobile:</b> ${order.phone}<br/>
        <b>Address:</b> ${order.address}</p>
        <p><b>Items:</b> ${order.items_text}</p>
        <p><b>Total:</b> ${money(order.total)}</p>
        ${order.note ? `<p><b>Note:</b> ${order.note}</p>` : ""}
        <p>Customer ko call karke confirm karo aur saman ghar pahuncha do.</p>
      </div>
    `;
}

async function sendViaHttps(to, subject, text, extra = {}) {
  const res = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: process.env.PUBLIC_URL || "https://babbu-karyana-store.onrender.com",
      Referer: (process.env.PUBLIC_URL || "https://babbu-karyana-store.onrender.com") + "/",
    },
    body: JSON.stringify({
      _subject: subject,
      _template: "table",
      _captcha: false,
      _honey: "",
      message: text,
      ...extra,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json().catch(() => ({}));
  const message = String(data.message || "");
  if (/activat/i.test(message)) {
    console.log("FormSubmit activation email sent to", to);
    return { sent: true, via: "https-activate" };
  }
  if (!res.ok || String(data.success) === "false") {
    throw new Error(message || "HTTPS email fail");
  }
  return { sent: true, via: "https" };
}

async function sendViaSmtp(to, subject, text, html) {
  if (!process.env.SMTP_USER || !smtpPass()) {
    throw new Error("SMTP set nahi hai");
  }
  await transporter().sendMail({
    from: `"Babbu Karyana Store" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
  return { sent: true, via: "smtp" };
}

async function deliver(to, subject, text, html, extra) {
  try {
    return await sendViaHttps(to, subject, text, extra);
  } catch (httpsErr) {
    console.error("HTTPS email fail:", httpsErr.message);
    try {
      return await sendViaSmtp(to, subject, text, html);
    } catch (smtpErr) {
      console.error("SMTP email fail:", smtpErr.message);
      return { sent: false, reason: smtpErr.message || httpsErr.message };
    }
  }
}

async function sendOrderEmail(to, order) {
  if (!to) return { sent: false, reason: "Owner email set nahi hai" };
  return deliver(
    to,
    `Naya order #${order.id} - Babbu Karyana Store`,
    orderText(order),
    orderHtml(order),
    {
      naam: order.customer_name,
      mobile: order.phone,
      address: order.address,
      items: order.items_text,
      total: money(order.total),
      note: order.note || "-",
    }
  );
}

async function sendTestEmail(to) {
  if (!to) throw new Error("Email daalo pehle");
  const result = await deliver(
    to,
    "Babbu Karyana Store - test email",
    "Email theek kaam kar raha hai. Naye orders yahan aa jayenge.",
    "<p>Email theek kaam kar raha hai. Naye orders yahan aa jayenge.</p>"
  );
  if (!result.sent) throw new Error(result.reason || "Email nahi gayi");
}

module.exports = { sendOrderEmail, sendTestEmail, canSend, orderText };

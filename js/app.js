import { signIn, signUp, signOut, currentUser } from "./cloud.js";
import { list, get, save, remove, initSync, sync } from "./store.js";
import { t, setLang, getLang, apply } from "./i18n.js";

const root = document.getElementById("app");
const today = () => new Date().toISOString().slice(0, 10);
// Dựng phần tử bằng textContent (không dùng innerHTML) để nội dung người dùng gõ không thể chèn mã.
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat().filter(k => k != null)); return e; };
const btn = (text, onclick, cls = "") => el("button", { type: "button", className: cls, textContent: text, onclick });
const link = (text, href, cls = "btn") => el("a", { className: cls, href, textContent: text });
const sel = (vals, label, cur) => { const s = el("select", {}, vals.map(v => el("option", { value: v, textContent: label(v) }))); s.value = cur; return s; };
const field = (key, input) => el("label", {}, el("span", { textContent: t(key) }), input);
const withTimeout = (p, ms = 15000) => Promise.race([p, new Promise(res => setTimeout(() => res({ error: { message: t("timeout") } }), ms))]);
const SVGNS = "http://www.w3.org/2000/svg";
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.append(...kids.flat().filter(x => x != null)); return e; };
const HUES = [174, 186, 340, 350, 26, 34]; // chỉ dùng tông lam ngọc, hồng, nâu
const hue = s => HUES[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
const norm = x => (x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
const fmtDate = iso => new Date(iso).toLocaleDateString(getLang() === "vi" ? "vi-VN" : "en-GB");
const pctOf = s => s.status === "done" ? 100 : s.total_pages ? Math.min(100, Math.round(100 * (s.current_page || 0) / s.total_pages)) : null;

let query = "", sortBy = "updated", filter = "all", sync_state = { state: "signed-out", message: "" };

function paintStatus() { const st = document.getElementById("status"); st.dataset.state = sync_state.state; st.textContent = t("st." + sync_state.state) + (sync_state.message ? ": " + sync_state.message : ""); }

const blk = (title, color, ...kids) => { const b = el("section", { className: "blk" }, el("h2", { className: "tt", textContent: title }), ...kids); b.style.setProperty("--c", color); return b; };

function bubbleMap(items, notes) {
  const cnt = st => items.filter(x => x.status === st).length, C = { cx: 80, cy: 100, r: 42 };
  const sats = [{ cx: 205, cy: 40, st: "reading", fill: "var(--teal-s)" }, { cx: 250, cy: 112, st: "want", fill: "var(--brown-s)" }, { cx: 150, cy: 158, st: "done", fill: "var(--pink-s)" }];
  const txt = (x, y, size, weight, fill, str) => sv("text", { x, y, "text-anchor": "middle", style: `font-size:${size}px;font-weight:${weight};fill:${fill}` }, String(str));
  return sv("svg", { viewBox: "0 0 300 200", class: "map", role: "img", "aria-label": t("blk.map") },
    sats.map(n => sv("line", { x1: C.cx, y1: C.cy, x2: n.cx, y2: n.cy, style: "stroke:var(--out);stroke-width:2" })),
    sv("circle", { cx: C.cx, cy: C.cy, r: C.r, style: "fill:var(--teal);stroke:var(--out);stroke-width:2" }),
    txt(C.cx, C.cy + 4, 26, 700, "#fff", items.length), txt(C.cx, C.cy + 22, 10, 500, "#fff", t("stat.total")),
    sats.map(n => [sv("circle", { cx: n.cx, cy: n.cy, r: 24, style: `fill:${n.fill};stroke:var(--out);stroke-width:2` }),
      txt(n.cx, n.cy + 6, 18, 700, "var(--ink)", cnt(n.st)), txt(n.cx, n.cy + 40, 10.5, 500, "var(--mut)", t("f." + n.st))]));
}
function timeline(items) {
  const recent = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5).reverse();
  return el("div", { className: "tl" }, recent.map(s => {
    const dot = el("a", { className: "dot", href: "#/source/" + s.id, title: s.title, textContent: [...s.title][0].toUpperCase() });
    dot.style.setProperty("--h", hue(s.title));
    return el("div", { className: "tl-i" }, dot, el("small", { textContent: s.title }), el("small", { className: "mut", textContent: fmtDate(s.started_at || s.created_at) }));
  }));
}
function nowReading(items) {
  const s = items.filter(x => x.status === "reading").sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!s) return el("div", { className: "empty" }, el("p", { className: "big", textContent: t("noReading") }), link("+ " + t("newSource"), "#/form", "btn p"));
  const p = pctOf(s) ?? 0, C = 2 * Math.PI * 42;
  const ring = sv("svg", { viewBox: "0 0 100 100", class: "ring" },
    sv("circle", { cx: 50, cy: 50, r: 42, style: "fill:var(--paper);stroke:var(--line);stroke-width:10" }),
    sv("circle", { cx: 50, cy: 50, r: 42, transform: "rotate(-90 50 50)", "stroke-linecap": "round", "stroke-dasharray": C, "stroke-dashoffset": C * (1 - p / 100), style: "fill:none;stroke:var(--teal);stroke-width:10" }),
    sv("text", { x: 50, y: 57, "text-anchor": "middle", style: "font-size:22px;font-weight:700;fill:var(--ink)" }, p + "%"));
  const pages = s.total_pages || s.current_page ? `${t("pages")}: ${s.current_page ?? 0}${s.total_pages ? " / " + s.total_pages : ""}` : null;
  return el("a", { className: "now", href: "#/source/" + s.id }, ring,
    el("div", { className: "lines" }, el("b", { textContent: s.title }), s.author ? el("span", { className: "mut", textContent: s.author }) : null,
      s.purpose ? el("em", { textContent: "“" + s.purpose + "”" }) : null, pages ? el("span", { className: "mut", textContent: pages }) : null));
}

async function library() {
  const items = await list("sources"), notes = await list("notes"), u = await currentUser();
  const box = el("div", { className: "table" });
  const thead = () => el("div", { className: "thead" }, el("span"), el("span", { textContent: t("col.title") }), el("span", { className: "hm", textContent: t("col.type") }), el("span", { textContent: t("col.status") }), el("span", { className: "hm", textContent: t("col.progress") }), el("span", { className: "hm", textContent: t("col.updated") }));
  const paint = () => {
    const q = norm(query);
    const rows = items.filter(s => (filter === "all" || s.status === filter) && (!q || norm(s.title + " " + (s.author || "")).includes(q)));
    rows.sort(sortBy === "title" ? (a, b) => a.title.localeCompare(b.title, getLang()) : sortBy === "progress" ? (a, b) => (pctOf(b) ?? -1) - (pctOf(a) ?? -1) : (a, b) => b.updated_at.localeCompare(a.updated_at));
    box.replaceChildren(...(rows.length ? [thead(), ...rows.map(trow)]
      : [el("div", { className: "empty" }, el("p", { className: "big", textContent: t(items.length ? "noResult" : "emptyTitle") }), el("p", { textContent: items.length ? "" : t("emptyHint") }))]));
  };
  const search = el("input", { type: "search", placeholder: t("searchPh"), value: query, oninput: e => { query = e.target.value; paint(); } });
  const sort = sel(["updated", "title", "progress"], x => t("sort." + x), sortBy);
  sort.onchange = e => { sortBy = e.target.value; paint(); };
  paint();
  const sum = `${items.length} ${t("stat.total").toLowerCase()} · ${notes.length} ${t("stat.notes").toLowerCase()}`;
  return el("section", {},
    u ? null : el("p", { className: "hint" }, t("signedOutHint") + " ", link(t("signIn"), "#/settings", "")),
    el("div", { className: "banner" }, el("div", {}, el("h1", { textContent: t("nav.library") }), el("p", { textContent: sum })), link("+ " + t("newSource"), "#/form", "btn alt")),
    blk(t("blk.map"), "var(--teal-d)", bubbleMap(items, notes)),
    items.length ? blk(t("blk.timeline"), "var(--brown-d)", timeline(items)) : null,
    blk(t("f.reading"), "var(--pink-d)", nowReading(items)),
    blk(t("blk.all"), "var(--teal-d)", el("div", { className: "tools" }, search, sort, el("div", { className: "seg" }, ["all", "reading", "want", "done"].map(f => btn(t("f." + f), () => { filter = f; render(); }, "chip" + (f === filter ? " on" : ""))))), box));
}
function trow(s) {
  const tile = el("span", { className: "tile", textContent: [...s.title][0].toUpperCase() });
  tile.style.setProperty("--h", hue(s.title));
  const p = pctOf(s), fill = el("i");
  if (p != null) fill.style.width = p + "%";
  return el("a", { className: "trow", href: "#/source/" + s.id }, tile,
    el("span", { className: "ttl" }, el("b", { textContent: s.title }), el("small", { textContent: s.author || "" })),
    el("span", { className: "cell hm", textContent: t("type." + s.type) }),
    el("span", { className: "badge b-" + s.status, textContent: t("status." + s.status) }),
    el("span", { className: "hm prog" }, p == null ? el("span", { className: "cell", textContent: "—" }) : [el("span", { className: "bar" }, fill), el("small", { textContent: p + "%" })]),
    el("span", { className: "cell hm", textContent: fmtDate(s.updated_at) }));
}

async function source(id) {
  const s = await get("sources", id);
  if (!s || s.deleted_at) return el("p", { textContent: t("notFound") });
  const setStatus = async st => { const p = { ...s, status: st }; if (st === "reading" && !s.started_at) p.started_at = today(); if (st === "done" && !s.finished_at) p.finished_at = today(); await save("sources", p); render(); };
  return el("section", { className: "narrow" },
    el("h1", { textContent: s.title }),
    el("p", { className: "mut", textContent: [s.author, t("type." + s.type)].filter(Boolean).join(" · ") }),
    el("div", { className: "seg" }, ["want", "reading", "done"].map(st => btn(t("status." + st), () => setStatus(st), "chip" + (st === s.status ? " on" : "")))),
    s.total_pages || s.current_page ? el("p", { textContent: `${t("pages")}: ${s.current_page ?? 0}${s.total_pages ? " / " + s.total_pages : ""}` }) : null,
    s.purpose ? el("div", {}, el("h2", { textContent: s.status === "done" ? t("youHoped") : t("purposeLbl") }), el("blockquote", { textContent: s.purpose })) : null,
    el("div", { className: "notes-soon", textContent: t("notesSoon") }),
    el("div", { className: "row" },
      link(t("edit"), "#/form/" + s.id),
      btn(t("del"), async () => { if (confirm(t("confirmDel"))) { await remove("sources", s.id); location.hash = "#/"; } })));
}

async function form(id) {
  const s = id ? await get("sources", id) : null, v = s || { type: "book", status: "want" };
  const type = sel(["book", "article", "podcast", "other"], x => t("type." + x), v.type);
  const title = el("input", { required: true, maxLength: 200, value: v.title || "" });
  const author = el("input", { value: v.author || "" });
  const status = sel(["want", "reading", "done"], x => t("status." + x), v.status);
  const purpose = el("textarea", { rows: 3, value: v.purpose || "", placeholder: t("purposePh") });
  const cur = el("input", { type: "number", min: 0, value: v.current_page ?? "" });
  const tot = el("input", { type: "number", min: 0, value: v.total_pages ?? "" });
  const num = x => x.value === "" ? null : Math.max(0, parseInt(x.value, 10) || 0);
  const f = el("form", { className: "form narrow" }, el("h1", { textContent: t(s ? "editSource" : "newSource") }),
    field("f.type", type), field("f.title", title), field("f.author", author), field("f.status", status), field("f.purpose", purpose), el("div", { className: "two" }, field("f.cur", cur), field("f.tot", tot)),
    el("div", { className: "row" }, el("button", { type: "submit", className: "p", textContent: t("save") }), link(t("cancel"), s ? "#/source/" + s.id : "#/")));
  f.onsubmit = async e => {
    e.preventDefault();
    const p = { type: type.value, title: title.value.trim(), author: author.value.trim() || null, status: status.value, purpose: purpose.value.trim() || null, current_page: num(cur), total_pages: num(tot) };
    if (!p.title) return;
    if (p.status === "reading" && !v.started_at) p.started_at = today();
    if (p.status === "done" && !v.finished_at) p.finished_at = today();
    const row = await save("sources", s ? { ...s, ...p } : p);
    location.hash = "#/source/" + row.id;
  };
  return f;
}

async function settings() {
  const u = await currentUser(), msg = el("p", { className: "mut" });
  const email = el("input", { type: "email", autocomplete: "username", placeholder: t("email") });
  const pw = el("input", { type: "password", autocomplete: "current-password", placeholder: t("password") });
  const fail = r => { msg.textContent = r.error ? r.error.message : ""; return !r.error; };
  return el("section", { className: "narrow" }, el("h1", { textContent: t("nav.settings") }),
    el("h2", { textContent: t("language") }), el("div", { className: "row" }, btn(t("lang"), () => { setLang(getLang() === "vi" ? "en" : "vi"); paintStatus(); render(); })),
    el("h2", { textContent: t("account") }),
    u ? el("div", {}, el("p", { textContent: `${t("signedInAs")} ${u.email}` }), btn(t("signOut"), async () => { await signOut(); sync_state = { state: "signed-out", message: "" }; paintStatus(); render(); }))
      : el("div", { className: "form" }, field("email", email), field("password", pw), el("div", { className: "row" },
          btn(t("signIn"), async () => { if (fail(await withTimeout(signIn(email.value.trim(), pw.value)))) { await sync(); location.hash = "#/"; } }, "p"),
          btn(t("signUp"), async () => { const r = await withTimeout(signUp(email.value.trim(), pw.value)); if (fail(r)) msg.textContent = t("checkEmail"); })), msg));
}

const pages = { library, source, form, settings, login: settings };
async function render() {
  const [, page, id] = location.hash.split("/");
  try { root.replaceChildren(await (pages[page] || library)(id)); }
  catch (e) { root.replaceChildren(el("p", { textContent: "Lỗi hiển thị / Render error: " + e.message })); }
  apply();
  const on = page === "settings" || page === "login" ? "#/settings" : "#/";
  document.querySelectorAll("nav a").forEach(a => a.toggleAttribute("aria-current", a.getAttribute("href") === on));
}
addEventListener("hashchange", render);
addEventListener("sync-status", e => {
  sync_state = e.detail; paintStatus();
  const page = location.hash.split("/")[1];
  if (e.detail.state === "synced" && (!page || page === "source")) render(); // không vẽ lại khi đang gõ ở form/cài đặt
});
addEventListener("auth-change", () => { setTimeout(sync, 0); const pg = location.hash.split("/")[1]; if (!pg || pg === "source" || pg === "settings") render(); });
apply(); paintStatus(); render(); initSync();

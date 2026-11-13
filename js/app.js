import { signIn, signUp, signOut, currentUser } from "./cloud.js";
import { list, listAll, get, save, remove, purge, importRows, initSync, sync } from "./store.js";
import { t, setLang, getLang, apply } from "./i18n.js";
import { PROMPTS } from "./prompts.js";

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

let lq = "", nkind = "all", query = "", sortBy = "updated", filter = "all", sync_state = { state: "signed-out", message: "" };

function paintStatus() { const st = document.getElementById("status"); st.dataset.state = sync_state.state; st.textContent = t("st." + sync_state.state) + (sync_state.message ? ": " + sync_state.message : ""); }

const KINDS = ["insight", "question", "rebuttal", "lesson"], DRAFT = "rj-draft";
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT)) || {}; } catch { return {}; } };
const saveDraft = d => localStorage.setItem(DRAFT, JSON.stringify(d));
const pickPrompt = avoid => { const n = PROMPTS.vi.length; let i; do { i = Math.floor(Math.random() * n); } while (n > 1 && i === avoid); return i; };
const byUpdated = (a, b) => b.updated_at.localeCompare(a.updated_at), byCreated = (a, b) => b.created_at.localeCompare(a.created_at);
const idMap = list_ => Object.fromEntries(list_.map(x => [x.id, x]));
const tileEl = s => { const x = el("span", { className: "tile", textContent: [...s.title][0].toUpperCase() }); x.style.setProperty("--h", hue(s.title)); return x; };

// Định dạng nhẹ: **đậm**, *nghiêng*, "- " danh sách, "> " trích dẫn. Dựng bằng DOM + textContent nên không thể chèn mã.
function inline(text) {
  const out = [], re = /\*\*(.+?)\*\*|\*(.+?)\*/g; let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) out.push(text.slice(last, m.index)); out.push(m[1] ? el("strong", { textContent: m[1] }) : el("em", { textContent: m[2] })); last = re.lastIndex; }
  out.push(text.slice(last)); return out;
}
function md(text) {
  const box = el("div", { className: "md" }); let ul = null;
  for (const line of text.split("\n")) {
    const li = /^\s*[-*]\s+(.*)/.exec(line);
    if (li) { if (!ul) box.append(ul = el("ul")); ul.append(el("li", {}, inline(li[1]))); continue; }
    ul = null;
    if (/^>\s?/.test(line)) box.append(el("blockquote", {}, inline(line.replace(/^>\s?/, ""))));
    else if (line.trim()) box.append(el("p", {}, inline(line)));
  }
  return box;
}

async function composer({ sourceId = null, after = render, note = null } = {}) {
  const sources = (await list("sources")).sort((a, b) => (b.status === "reading") - (a.status === "reading") || byUpdated(a, b));
  const d = note ? { text: note.reflection, quote: note.quote, page: note.page, kind: note.kind, source_id: note.source_id, pi: /^p\d+$/.test(note.prompt_key || "") ? +note.prompt_key.slice(1) : null } : loadDraft(), ids = new Set(sources.map(s => s.id));
  let kind = KINDS.includes(d.kind) ? d.kind : "insight", pi = Number.isInteger(d.pi) ? d.pi : pickPrompt(-1);
  const first = [sourceId, d.source_id, localStorage.getItem("rj-last-source"), sources.find(s => s.status === "reading")?.id].find(x => x && ids.has(x)) ?? "";
  const q = el("p", { className: "q", textContent: PROMPTS[getLang()][pi] });
  const text = el("textarea", { rows: 4, value: d.text || "", placeholder: t("notePh") }); text.setAttribute("aria-label", t("notePh"));
  const quote = el("textarea", { rows: 2, value: d.quote || "", placeholder: t("quoteLbl") });
  const page = el("input", { type: "number", min: 0, value: d.page || "", placeholder: t("pageLbl") });
  const src = el("select", {}, [el("option", { value: "", textContent: t("inbox") }), ...sources.map(s => el("option", { value: s.id, textContent: s.title }))]); src.value = first;
  const info = el("small", { className: "mut" });
  const persist = () => { if (note) return; saveDraft({ text: text.value, quote: quote.value, page: page.value, kind, source_id: src.value, pi }); info.textContent = t("draftSaved"); };
  const chips = el("div", { className: "seg" }, KINDS.map(k => btn(t("kind." + k), () => { kind = k; chips.querySelectorAll(".chip").forEach((c, i) => c.classList.toggle("on", KINDS[i] === k)); persist(); }, "chip" + (k === kind ? " on" : ""))));
  [text, quote, page].forEach(x => x.oninput = persist); src.onchange = persist;
  const submit = async () => {
    const reflection = text.value.trim();
    if (!reflection) { info.textContent = t("needText"); text.focus(); return; }
    await save("notes", { ...(note || {}), source_id: src.value || null, kind, reflection, quote: quote.value.trim() || null, page: page.value === "" ? null : Math.max(0, parseInt(page.value, 10) || 0), prompt_key: note ? note.prompt_key : "p" + pi });
    if (!note) { localStorage.setItem("rj-last-source", src.value); localStorage.removeItem(DRAFT); }
    after();
  };
  text.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); };
  return el("div", { className: "composer" }, q, btn(t("otherPrompt"), () => { pi = pickPrompt(pi); q.textContent = PROMPTS[getLang()][pi]; persist(); }, "link"),
    text, el("p", { className: "mut hintm", textContent: t("mdHint") }), chips,
    el("details", { open: !!(d.quote || d.page) }, el("summary", { textContent: t("moreFields") }), quote, page),
    el("div", { className: "row" }, src, info, el("button", { type: "button", className: "btn p sp", textContent: t("saveNote"), onclick: submit })));
}

const assignSel = (n, sources) => { const s = sel(["", ...sources.map(x => x.id)], v => v ? sources.find(x => x.id === v).title : t("assignTo"), ""); s.onchange = async e => { if (e.target.value) { await save("notes", { ...n, source_id: e.target.value }); render(); } }; return s; };
function noteItem(n, byId, sources = null) {
  const s = byId[n.source_id];
  return el("article", { className: "nt" },
    el("div", { className: "meta" }, el("span", { className: "tag k-" + n.kind, textContent: t("kind." + n.kind) }),
      s ? link(s.title, "#/source/" + s.id, "") : el("span", { className: "mut", textContent: t("inbox") }),
      el("span", { className: "mut", textContent: [n.page ? t("pageShort") + " " + n.page : null, fmtDate(n.created_at)].filter(Boolean).join(" · ") })),
    n.quote ? el("blockquote", { textContent: n.quote }) : null, md(n.reflection),
    el("div", { className: "row" }, sources ? assignSel(n, sources) : null,
      link(t("edit"), "#/editnote/" + n.id, "link"), btn(t("del"), async () => { if (confirm(t("confirmDelNote"))) { await remove("notes", n.id); render(); } }, "link")));
}

async function home() {
  const [sources, notes, u] = await Promise.all([list("sources"), list("notes"), currentUser()]), byId = idMap(sources);
  const reading = sources.filter(s => s.status === "reading").sort(byUpdated);
  const stale = (sources.length + notes.length) > 0 && Date.now() - Date.parse(localStorage.getItem("rj-last-export") || "1970-01-01") > 12096e5; // 14 ngày
  const week = notes.filter(n => Date.now() - Date.parse(n.created_at) < 6048e5).length, inbox = notes.filter(n => !n.source_id).length;
  const h = new Date().getHours(), date = new Date().toLocaleDateString(getLang() === "vi" ? "vi-VN" : "en-GB", { weekday: "long", day: "numeric", month: "numeric" });
  const bk = s => { const p = pctOf(s), fill = el("i"); if (p != null) fill.style.width = p + "%";
    return el("div", { className: "bk" }, tileEl(s), el("a", { className: "bt", href: "#/source/" + s.id }, el("b", { textContent: s.title }), el("small", { className: "mut", textContent: s.author || "" }), p == null ? null : el("span", { className: "bar" }, fill)), link("+ " + t("addShort"), "#/note/" + s.id, "btn sm")); };
  const row = (a, b, href) => el("a", { href }, el("span", { textContent: a }), el("b", { textContent: b }));
  return el("section", {},
    u ? null : el("p", { className: "hint" }, t("signedOutHint") + " ", link(t("signIn"), "#/settings", "")),
    stale ? el("p", { className: "hint" }, t("backupDue") + " ", link(t("backupNow"), "#/settings", "")) : null,
    el("div", { className: "head" }, el("div", {}, el("h1", { textContent: t(h < 12 ? "greet.am" : h < 18 ? "greet.pm" : "greet.eve") }), el("span", { className: "mut", textContent: date }))),
    el("div", { className: "card compose" }, await composer()),
    el("div", { className: "cols" },
      el("div", { className: "stack" },
        el("div", { className: "card" }, el("h2", { textContent: t("f.reading") }), reading.length ? reading.map(bk) : el("p", { className: "mut", textContent: t("noReading") })),
        el("div", { className: "card" }, el("h2", { textContent: t("recentNotes") }), notes.length ? [...notes].sort(byCreated).slice(0, 4).map(n => noteItem(n, byId)) : el("p", { className: "mut", textContent: t("noNotes") }))),
      el("div", { className: "card today" }, el("h2", { textContent: t("today") }),
        row(t("nav.inbox"), `${inbox} ${t("unsorted")}`, "#/inbox"), row(t("thisWeek"), `${week} ${t("stat.notes").toLowerCase()}`, "#/notes"), el("a", { href: "#/" }, el("span", { textContent: t("review") }), el("span", { className: "mut", textContent: t("soon") })))));
}

async function noteEdit(id) {
  const n = await get("notes", id);
  if (!n || n.deleted_at) return el("p", { textContent: t("notFound") });
  const back = () => { location.hash = n.source_id ? "#/source/" + n.source_id : "#/notes"; };
  return el("section", { className: "narrow" }, el("h1", { textContent: t("editNote") }), el("div", { className: "card compose", style: "margin-top:16px" }, await composer({ note: n, after: back })), el("div", { className: "row" }, link(t("cancel"), "#/notes", "link")));
}
async function notePage(id) { return el("section", { className: "narrow" }, el("h1", { textContent: t("newNote") }), el("div", { className: "card compose", style: "margin-top:16px" }, await composer({ sourceId: id || null, after: () => { location.hash = id ? "#/source/" + id : "#/"; } }))); }

async function notesPage(mode) {
  const [sources, all] = await Promise.all([list("sources"), list("notes")]), byId = idMap(sources);
  const base = mode === "inbox" ? all.filter(n => !n.source_id) : all, box = el("div", { className: "stack" });
  const paint = () => { const q = norm(query);
    const items = base.filter(n => (nkind === "all" || n.kind === nkind) && (!q || norm(n.reflection + " " + (n.quote || "") + " " + (byId[n.source_id]?.title || "")).includes(q))).sort(byCreated);
    box.replaceChildren(...(items.length ? items.map(n => noteItem(n, byId, mode === "inbox" ? sources : null)) : [el("div", { className: "empty" }, el("p", { className: "big", textContent: t("noNotes") }))])); };
  const search = el("input", { type: "search", placeholder: t("searchNotes"), value: query, oninput: e => { query = e.target.value; paint(); } });
  paint();
  return el("section", { className: "narrow" }, el("div", { className: "head" }, el("h1", { textContent: t(mode === "inbox" ? "nav.inbox" : "nav.notes") }), link(t("quickNote"), "#/note", "btn p")),
    el("div", { className: "tools" }, search, el("div", { className: "seg" }, ["all", ...KINDS].map(k => btn(t(k === "all" ? "f.all" : "kind." + k), () => { nkind = k; render(); }, "chip" + (k === nkind ? " on" : ""))))), box);
}

const wide = () => matchMedia("(min-width: 1280px)").matches;
let selId = null;
function panel(s, notes) {
  const p = pctOf(s), fill = el("i"); if (p != null) fill.style.width = p + "%";
  const ns = notes.filter(n => n.source_id === s.id).sort(byCreated);
  return [el("div", { className: "bk" }, tileEl(s), el("div", {}, el("b", { textContent: s.title }), el("br"), el("small", { className: "mut", textContent: [s.author, t("type." + s.type)].filter(Boolean).join(" · ") }))),
    el("span", { className: "badge b-" + s.status, textContent: t("status." + s.status) }),
    s.purpose ? el("div", {}, el("h2", { textContent: t("purposeLbl") }), el("blockquote", { textContent: s.purpose })) : null,
    p == null ? null : el("div", {}, el("h2", { textContent: t("pages") + (s.total_pages ? ` · ${s.current_page ?? 0}/${s.total_pages}` : "") }), el("span", { className: "bar" }, fill)),
    el("div", {}, el("h2", { textContent: `${t("nav.notes")} (${ns.length})` }), ...(ns.length ? ns.slice(0, 3).map(n => el("div", { className: "nt" }, el("span", { className: "tag k-" + n.kind, textContent: t("kind." + n.kind) }), md(n.reflection))) : [el("p", { className: "mut", textContent: t("noNotes") })])),
    el("div", { className: "row" }, link("+ " + t("addShort"), "#/note/" + s.id, "btn p"), link(t("open"), "#/source/" + s.id, "btn"), link(t("edit"), "#/form/" + s.id, "btn"))];
}
async function library() {
  const [items, notes, u] = await Promise.all([list("sources"), list("notes"), currentUser()]), box = el("div", { className: "table" }), side = el("aside", { className: "card pn" });
  const showPanel = s => side.replaceChildren(...(s ? panel(s, notes) : [el("p", { className: "mut", textContent: t("pickOne") })]));
  const pick = s => { selId = s.id; box.querySelectorAll(".trow").forEach(r => r.classList.toggle("sel", r.dataset.id === s.id)); showPanel(s); };
  const thead = () => el("div", { className: "thead" }, el("span"), el("span", { textContent: t("col.title") }), el("span", { className: "hm", textContent: t("col.type") }), el("span", { textContent: t("col.status") }), el("span", { className: "hm", textContent: t("col.progress") }), el("span", { className: "hm", textContent: t("col.updated") }));
  const paint = () => {
    const q = norm(lq);
    const rows = items.filter(s => (filter === "all" || s.status === filter) && (!q || norm(s.title + " " + (s.author || "")).includes(q)));
    rows.sort(sortBy === "title" ? (a, b) => a.title.localeCompare(b.title, getLang()) : sortBy === "progress" ? (a, b) => (pctOf(b) ?? -1) - (pctOf(a) ?? -1) : byUpdated);
    if (!rows.some(s => s.id === selId)) selId = rows[0]?.id ?? null;
    box.replaceChildren(...(rows.length ? [thead(), ...rows.map(trow)] : [el("div", { className: "empty" }, el("p", { className: "big", textContent: t(items.length ? "noResult" : "emptyTitle") }), el("p", { textContent: items.length ? "" : t("emptyHint") }))]));
    showPanel(rows.find(s => s.id === selId));
  };
  const trow = s => {
    const tile = tileEl(s), p = pctOf(s), fill = el("i"); if (p != null) fill.style.width = p + "%";
    const a = el("a", { className: "trow" + (s.id === selId ? " sel" : ""), href: "#/source/" + s.id, onclick: e => { if (wide()) { e.preventDefault(); pick(s); } } }, tile,
      el("span", { className: "ttl" }, el("b", { textContent: s.title }), el("small", { textContent: s.author || "" })),
      el("span", { className: "cell hm", textContent: t("type." + s.type) }), el("span", { className: "badge b-" + s.status, textContent: t("status." + s.status) }),
      el("span", { className: "hm prog" }, p == null ? el("span", { className: "cell", textContent: "—" }) : [el("span", { className: "bar" }, fill), el("small", { textContent: p + "%" })]),
      el("span", { className: "cell hm", textContent: fmtDate(s.updated_at) }));
    a.dataset.id = s.id; return a;
  };
  const search = el("input", { type: "search", placeholder: t("searchPh"), value: lq, oninput: e => { lq = e.target.value; paint(); } });
  const sort = sel(["updated", "title", "progress"], x => t("sort." + x), sortBy); sort.onchange = e => { sortBy = e.target.value; paint(); };
  paint();
  return el("section", {}, u ? null : el("p", { className: "hint" }, t("signedOutHint") + " ", link(t("signIn"), "#/settings", "")),
    el("div", { className: "head" }, el("h1", { textContent: t("nav.library") }), link("+ " + t("newSource"), "#/form", "btn p")),
    el("div", { className: "split" }, el("div", {}, el("div", { className: "tools" }, search, sort, el("div", { className: "seg" }, ["all", "reading", "want", "done"].map(f => btn(t("f." + f), () => { filter = f; render(); }, "chip" + (f === filter ? " on" : ""))))), box), side));
}

const purgeItem = async (n, r) => { // gỡ liên kết ghi chép trước, tránh lỗi khóa ngoại khi đồng bộ
  if (n === "sources") for (const x of (await listAll("notes")).filter(x => x.source_id === r.id)) await save("notes", { ...x, source_id: null });
  await purge(n, r.id);
};
async function autoPurge() { // mục đã xóa quá 30 ngày và đã đồng bộ thì xóa hẳn
  const cut = Date.now() - 30 * 864e5;
  for (const n of ["notes", "sources"]) for (const r of await listAll(n)) if (r.deleted_at && !r.dirty && Date.parse(r.deleted_at) < cut) await purgeItem(n, r);
}
async function trash() {
  const [ss, ns] = await Promise.all([listAll("sources"), listAll("notes")]);
  const items = [...ss.filter(r => r.deleted_at).map(r => ({ n: "sources", r })), ...ns.filter(r => r.deleted_at).map(r => ({ n: "notes", r }))].sort((a, b) => b.r.deleted_at.localeCompare(a.r.deleted_at));
  const left = r => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(r.deleted_at)) / 864e5));
  const row = ({ n, r }) => el("div", { className: "nt" },
    el("div", { className: "meta" }, el("span", { className: "tag " + (n === "sources" ? "k-question" : "k-insight"), textContent: t(n === "sources" ? "nav.library" : "nav.notes") }), el("span", { className: "mut", textContent: `${fmtDate(r.deleted_at)} · ${t("daysLeft").replace("{n}", left(r))}` })),
    el("p", { textContent: n === "sources" ? r.title : r.reflection.slice(0, 120) }),
    el("div", { className: "row" }, btn(t("restore"), async () => { await save(n, { ...r, deleted_at: null }); render(); }, "link"),
      btn(t("deleteForever"), async () => { if (confirm(t("confirmForever"))) { await purgeItem(n, r); render(); } }, "link")));
  return el("section", { className: "narrow" }, el("h1", { textContent: t("trash") }), el("p", { className: "mut", textContent: t("trashHint") }),
    items.length ? el("div", { className: "card" }, items.map(row)) : el("div", { className: "empty" }, el("p", { className: "big", textContent: t("trashEmpty") })));
}

async function source(id) {
  const s = await get("sources", id);
  if (!s || s.deleted_at) return el("p", { textContent: t("notFound") });
  const setStatus = async st => { const p = { ...s, status: st }; if (st === "reading" && !s.started_at) p.started_at = today(); if (st === "done" && !s.finished_at) p.finished_at = today(); await save("sources", p); render(); };
  const sn = (await list("notes")).filter(n => n.source_id === s.id).sort(byCreated), byId = { [s.id]: s };
  return el("section", { className: "narrow" },
    el("h1", { textContent: s.title }),
    el("p", { className: "mut", textContent: [s.author, t("type." + s.type)].filter(Boolean).join(" · ") }),
    el("div", { className: "seg" }, ["want", "reading", "done"].map(st => btn(t("status." + st), () => setStatus(st), "chip" + (st === s.status ? " on" : "")))),
    s.total_pages || s.current_page ? el("p", { textContent: `${t("pages")}: ${s.current_page ?? 0}${s.total_pages ? " / " + s.total_pages : ""}` }) : null,
    s.purpose ? el("div", {}, el("h2", { textContent: s.status === "done" ? t("youHoped") : t("purposeLbl") }), el("blockquote", { textContent: s.purpose })) : null,
    el("div", { className: "card compose" }, await composer({ sourceId: s.id })), el("h2", { textContent: t("nav.notes"), style: "margin-top:22px" }), el("div", { className: "stack" }, sn.length ? sn.map(n => noteItem(n, byId)) : el("p", { className: "mut", textContent: t("noNotes") })),
    el("div", { className: "row" },
      link(t("edit"), "#/form/" + s.id),
      btn(t("del"), async () => { if (confirm(t("confirmDel"))) { await remove("sources", s.id); location.hash = "#/library"; } })));
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
    el("div", { className: "row" }, el("button", { type: "submit", className: "p", textContent: t("save") }), link(t("cancel"), s ? "#/source/" + s.id : "#/library")));
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

async function settingsBase() {
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SRC = ["id", "type", "title", "author", "status", "purpose", "started_at", "finished_at", "current_page", "total_pages", "created_at", "updated_at", "deleted_at"];
const NOTE = ["id", "source_id", "kind", "reflection", "quote", "page", "prompt_key", "created_at", "updated_at", "deleted_at"];
// Kiểm tra nghiêm: bản ghi sai kiểu mà lọt vào sẽ làm đồng bộ lỗi mãi mãi.
function cleanBackup(d) {
  if (!d || d.app !== "reading-journal" || !Array.isArray(d.sources) || !Array.isArray(d.notes)) throw new Error("format");
  const pick = (r, keys) => Object.fromEntries(keys.filter(k => r && r[k] !== undefined).map(k => [k, r[k]]));
  const date = x => typeof x === "string" && !isNaN(Date.parse(x)), str = v => v == null || typeof v === "string", int = v => v == null || Number.isInteger(v);
  const sources = d.sources.map(r => pick(r, SRC)).filter(r => UUID.test(r.id) && typeof r.title === "string" && r.title.trim() && ["book", "article", "podcast", "other"].includes(r.type) && ["want", "reading", "done"].includes(r.status) && date(r.created_at) && date(r.updated_at) && [r.author, r.purpose, r.started_at, r.finished_at, r.deleted_at].every(str) && int(r.current_page) && int(r.total_pages));
  const notes = d.notes.map(r => pick(r, NOTE)).filter(r => UUID.test(r.id) && typeof r.reflection === "string" && r.reflection.trim() && KINDS.includes(r.kind) && date(r.created_at) && date(r.updated_at) && (r.source_id == null || UUID.test(r.source_id)) && [r.quote, r.prompt_key, r.deleted_at].every(str) && int(r.page));
  return { sources, notes };
}
async function dataPanel() {
  const tc = [...(await listAll("sources")), ...(await listAll("notes"))].filter(r => r.deleted_at).length;
  const msg = el("p", { className: "mut" }), le = localStorage.getItem("rj-last-export"), stamp = new Date().toISOString().slice(0, 10);
  const download = (name, text, type) => { const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const done = () => { localStorage.setItem("rj-last-export", new Date().toISOString()); render(); };
  const exportJson = async () => { download(`reading-journal-${stamp}.json`, JSON.stringify({ app: "reading-journal", v: 1, exported_at: new Date().toISOString(), sources: await listAll("sources"), notes: await listAll("notes") }, null, 2), "application/json"); done(); };
  const exportMd = async () => {
    const [ss, ns] = await Promise.all([list("sources"), list("notes")]), asc = (a, b) => a.created_at.localeCompare(b.created_at);
    const fmt = n => `- **${t("kind." + n.kind)}**${n.page ? ` (${t("pageShort")} ${n.page})` : ""} · ${fmtDate(n.created_at)}\n` + (n.quote ? n.quote.split("\n").map(l => "  > " + l).join("\n") + "\n" : "") + n.reflection.split("\n").map(l => "  " + l).join("\n");
    const out = [`# ${t("app")}\n`], ids = new Set(ss.map(s => s.id));
    for (const s of ss.sort((a, b) => a.title.localeCompare(b.title))) { out.push(`## ${s.title}\n${[s.author, t("type." + s.type), t("status." + s.status)].filter(Boolean).join(" · ")}\n`); if (s.purpose) out.push(`> ${t("purposeLbl")}: ${s.purpose}\n`); out.push(...ns.filter(n => n.source_id === s.id).sort(asc).map(fmt), ""); }
    const loose = ns.filter(n => !ids.has(n.source_id)).sort(asc); if (loose.length) out.push(`## ${t("inbox")}\n`, ...loose.map(fmt));
    download(`reading-journal-${stamp}.md`, out.join("\n"), "text/markdown"); done();
  };
  const file = el("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.onchange = async () => {
    try {
      const rows = cleanBackup(JSON.parse(await file.files[0].text())), known = new Set(rows.sources.map(r => r.id));
      for (const n of rows.notes) if (n.source_id && !known.has(n.source_id) && !(await get("sources", n.source_id))) n.source_id = null; // tránh lỗi khóa ngoại khi đồng bộ
      const a = await importRows("sources", rows.sources), b = await importRows("notes", rows.notes);
      msg.textContent = `${t("imported")}: ${a} ${t("nav.library").toLowerCase()}, ${b} ${t("nav.notes").toLowerCase()}`;
    } catch (e) { msg.textContent = `${t("importFail")} ${e.message}`; }
    file.value = "";
  };
  return el("div", {}, el("h2", { textContent: t("dataTitle") }), el("p", { className: "mut", textContent: t("dataHint") }),
    el("div", { className: "row" }, btn(t("exportJson"), exportJson, "p"), btn(t("exportMd"), exportMd), btn(t("importJson"), () => file.click()), link(`${t("trash")} (${tc})`, "#/trash", "btn"), file),
    el("p", { className: "mut", textContent: `${t("lastExport")}: ${le ? fmtDate(le) : t("never")}` }), msg);
}
async function settings() { const sec = await settingsBase(); sec.append(await dataPanel()); return sec; }
const pages = { home, library, source, form, settings, login: settings, note: notePage, editnote: noteEdit, trash, notes: () => notesPage(), inbox: () => notesPage("inbox") };
const NAVMAP = { home: "#/", note: "#/", editnote: "#/notes", trash: "#/settings", library: "#/library", source: "#/library", form: "#/library", notes: "#/notes", inbox: "#/inbox", settings: "#/settings", login: "#/settings" };
async function render() {
  const [, page, id] = location.hash.split("/");
  try { root.replaceChildren(await (pages[page] || home)(id)); }
  catch (e) { root.replaceChildren(el("p", { textContent: "Lỗi hiển thị / Render error: " + e.message })); }
  apply();
  const on = NAVMAP[page || "home"] ?? "#/";
  document.querySelectorAll("#nav a").forEach(a => a.toggleAttribute("aria-current", a.getAttribute("href") === on));
  document.querySelectorAll("[data-lang]").forEach(b => b.toggleAttribute("aria-current", b.dataset.lang === getLang()));
  const n = (await list("notes")).filter(x => !x.source_id).length, b = document.getElementById("inboxN");
  b.textContent = n; b.hidden = !n;
}
// Không vẽ lại khi bạn đang gõ (nháp vẫn được lưu riêng).
const softRender = () => { if (!/^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement?.tagName)) render(); };
addEventListener("hashchange", render);
addEventListener("sync-status", e => {
  sync_state = e.detail; paintStatus();
  const page = location.hash.split("/")[1];
  if (e.detail.state === "synced" && !["form", "note", "settings", "login"].includes(page)) softRender();
});
addEventListener("auth-change", () => { setTimeout(sync, 0); const pg = location.hash.split("/")[1]; if (!["form", "note"].includes(pg)) softRender(); });
document.getElementById("gsearch").onsubmit = e => { e.preventDefault(); query = document.getElementById("gq").value.trim(); if (location.hash === "#/notes") render(); else location.hash = "#/notes"; };
document.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => { setLang(b.dataset.lang); paintStatus(); render(); });
apply(); paintStatus(); render(); initSync(); setTimeout(autoPurge, 5000);

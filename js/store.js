// Lưu trên máy trước (IndexedDB), đồng bộ Supabase sau. Thua-thắng theo updated_at (bản sửa sau cùng thắng).
import { supabase, currentUser } from "./cloud.js";
const NAMES = ["sources", "notes"]; // thứ tự đẩy: nguồn trước, ghi chép sau (khóa ngoại)
let dbp, syncing = false, timer;
const open = () => dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open("reading-journal-v2", 1);
  r.onupgradeneeded = () => [...NAMES, "meta"].forEach(n => r.result.createObjectStore(n, { keyPath: n === "meta" ? "key" : "id" }));
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const run = async (store, mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode), req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req?.result); tx.onerror = () => rej(tx.error);
  });
};
const emit = (state, message = "") => dispatchEvent(new CustomEvent("sync-status", { detail: { state, message } }));
const getAll = n => run(n, "readonly", s => s.getAll());

export const get = (n, id) => run(n, "readonly", s => s.get(id));
export const list = async n => (await getAll(n)).filter(r => !r.deleted_at);

export async function save(n, rec) {
  const t = new Date().toISOString();
  const base = rec.id ? (await get(n, rec.id)) || {} : { id: crypto.randomUUID(), created_at: t };
  const row = { ...base, ...rec, created_at: base.created_at || t, updated_at: t, dirty: 1 };
  await run(n, "readwrite", s => s.put(row));
  queueSync();
  return row;
}
// Xóa mềm: chỉ đánh dấu deleted_at (thùng rác 30 ngày sẽ làm ở bước sau)
export const remove = async (n, id) => { const r = await get(n, id); return r && save(n, { ...r, deleted_at: new Date().toISOString() }); };

export function queueSync() { clearTimeout(timer); timer = setTimeout(sync, 800); }

export async function sync() {
  if (syncing) return;
  const user = await currentUser();
  if (!user) return emit("signed-out");
  if (!navigator.onLine) return emit("offline");
  syncing = true; emit("syncing");
  try {
    for (const n of NAMES) { // 1) đẩy các bản ghi đã sửa trên máy
      for (const r of (await getAll(n)).filter(x => x.dirty)) {
        const { dirty, ...payload } = r; // synced_at = thời điểm đẩy lên (giờ của thiết bị), dùng làm con trỏ kéo dữ liệu
        const { error } = await supabase.from(n).upsert({ ...payload, user_id: user.id, synced_at: new Date().toISOString() });
        if (error) throw error;
        const cur = await get(n, r.id); // nếu trong lúc đẩy lại có sửa tiếp thì vẫn để dirty
        if (cur.updated_at === r.updated_at) await run(n, "readwrite", s => s.put({ ...cur, dirty: 0 }));
      }
    }
    for (const n of NAMES) { // 2) kéo thay đổi mới từ máy chủ (con trỏ riêng cho từng bảng)
      const cursor = (await get("meta", "pull:" + n))?.value;
      const since = cursor ? new Date(Date.parse(cursor) - 5 * 60 * 1000).toISOString() : "1970-01-01T00:00:00Z"; // lùi 5 phút phòng lệch đồng hồ; kéo trùng không sao
      const { data, error } = await supabase.from(n).select("*").gt("synced_at", since).order("synced_at").limit(1000);
      if (error) throw error;
      for (const remote of data) {
        const local = await get(n, remote.id);
        if (local?.dirty && local.updated_at > remote.updated_at) continue; // bản trên máy mới hơn, giữ lại để đẩy lần sau
        await run(n, "readwrite", s => s.put({ ...remote, dirty: 0 }));
      }
      if (data.length) await run("meta", "readwrite", s => s.put({ key: "pull:" + n, value: data[data.length - 1].synced_at }));
      if (data.length === 1000) queueSync(); // còn nữa thì kéo tiếp
    }
    emit("synced");
  } catch (e) { emit("error", e.message); } finally { syncing = false; }
}

export function initSync() {
  addEventListener("online", sync);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && sync());
  sync();
}

// Dùng cho xuất/nhập dữ liệu. importRows: bản ghi nào mới hơn bản trên máy mới được ghi đè; đánh dấu dirty để tự đồng bộ lên.
export const listAll = n => getAll(n);
export async function importRows(n, rows) {
  let count = 0;
  for (const r of rows) {
    const cur = await get(n, r.id);
    if (cur && cur.updated_at >= r.updated_at) continue;
    await run(n, "readwrite", s => s.put({ ...r, dirty: 1 }));
    count++;
  }
  queueSync();
  return count;
}

// Xóa vĩnh viễn: xóa trên máy, rồi thử xóa trên máy chủ (nếu lỗi/offline thì bản ẩn trên máy chủ vô hại).
export async function purge(n, id) {
  await run(n, "readwrite", s => s.delete(id));
  const user = await currentUser();
  if (user && navigator.onLine) await supabase.from(n).delete().eq("id", id);
}

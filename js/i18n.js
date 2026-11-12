// Mọi chữ trên giao diện nằm ở đây. Thêm ngôn ngữ/khóa mới chỉ cần sửa file này.
const D = {
  vi: { app: "Nhật ký đọc", email: "Email", password: "Mật khẩu", signIn: "Đăng nhập", signUp: "Tạo tài khoản", signOut: "Đăng xuất",
    addSource: "Thêm nguồn thử", addNote: "Thêm ghi chép thử", needSource: "Hãy thêm một nguồn trước.", empty: "Chưa có dữ liệu.",
    "st.signed-out": "Chưa đăng nhập (dữ liệu chỉ lưu trên máy)", "st.offline": "Đang offline, sẽ đồng bộ khi có mạng", "st.syncing": "Đang đồng bộ…", "st.synced": "Đã đồng bộ", "st.error": "Lỗi đồng bộ",
    checkEmail: "Đã tạo tài khoản. Nếu được yêu cầu, hãy xác nhận email rồi đăng nhập.", sources: "Nguồn", notes: "Ghi chép", lang: "English" },
  en: { app: "Reading Journal", email: "Email", password: "Password", signIn: "Sign in", signUp: "Create account", signOut: "Sign out",
    addSource: "Add test source", addNote: "Add test note", needSource: "Add a source first.", empty: "Nothing here yet.",
    "st.signed-out": "Signed out (data stays on this device)", "st.offline": "Offline, will sync when back online", "st.syncing": "Syncing…", "st.synced": "Synced", "st.error": "Sync error",
    checkEmail: "Account created. If asked, confirm your email, then sign in.", sources: "Sources", notes: "Notes", lang: "Tiếng Việt" },
};
let lang = localStorage.getItem("rj-lang") || "vi";
export const getLang = () => lang;
export const t = k => D[lang][k] ?? D.vi[k] ?? k;
export function setLang(l) { lang = l; localStorage.setItem("rj-lang", l); document.documentElement.lang = l; apply(); }
export function apply() { document.querySelectorAll("[data-i18n]").forEach(e => e.textContent = t(e.dataset.i18n)); document.querySelectorAll("[data-i18n-ph]").forEach(e => e.placeholder = t(e.dataset.i18nPh)); }

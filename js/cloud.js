import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
// lock: tắt khóa liên-tab (app 1 người dùng) để một tab cũ bị treo không giữ khóa và làm treo mọi tab khác.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, lock: (_name, _timeout, fn) => fn() } });
let user = null;
// Chỉ ghi nhớ user trong callback (đồng bộ, không gọi lại supabase ở đây => không thể deadlock). Giao diện đọc user từ biến này, không chờ mạng/khóa.
supabase.auth.onAuthStateChange((_event, session) => { user = session?.user ?? null; dispatchEvent(new Event("auth-change")); });
export const currentUser = async () => user;
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signUp = (email, password) => supabase.auth.signUp({ email, password });
export const signOut = () => supabase.auth.signOut();

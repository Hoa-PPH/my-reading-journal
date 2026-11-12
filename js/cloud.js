import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
export const currentUser = async () => (await supabase.auth.getSession()).data.session?.user ?? null;
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signUp = (email, password) => supabase.auth.signUp({ email, password });
export const signOut = () => supabase.auth.signOut();

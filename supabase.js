// ilogia — single Supabase client + service layer (replaces api/*.php).
// Only the public publishable key lives here. Security is enforced by RLS (see supabase/001_schema.sql).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const supabase = createClient(
  'https://zugwicbbfbefbbwugfxq.supabase.co',
  'sb_publishable_34jNpaqwtFeYboTVgO-mYw_efc0T-Ew',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

const unwrap = ({ data, error }) => { if (error) throw error; return data; };

// ---- auth: register.php, login.php, logout.php, me.php, send_otp/verify_otp, social_login.php
export const authService = {
  // Email verification is handled by Supabase (confirmation email) instead of EmailJS OTP.
  register: (fullName, email, password) =>
    supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: location.origin } }).then(unwrap),
  login: (email, password) => supabase.auth.signInWithPassword({ email, password }).then(unwrap),
  google: () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } }).then(unwrap),
  // Google Identity Services ID token -> Supabase verifies the token server-side
  googleIdToken: (token) => supabase.auth.signInWithIdToken({ provider: 'google', token }).then(unwrap),
  logout: () => supabase.auth.signOut(),
  resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin }).then(unwrap),
  // IMPORTANT: never call supabase.* (or return a promise) inside this callback — supabase-js holds an
  // internal lock while it runs, so awaiting another auth call here deadlocks and login "does nothing".
  // We defer the work to the next tick so the lock is released first.
  onChange: (cb) => supabase.auth.onAuthStateChange((_e, session) => { setTimeout(() => cb(session), 0); }),
  session: () => supabase.auth.getSession().then(unwrap).then(d => d.session),
};

export const userService = {
  async me() {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    // maybeSingle: a brand-new Google user may not have a profile row yet -> don't fail, fall back to auth metadata
    const { data: profile, error: pErr } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (pErr) console.warn('[ilogia] profile read failed:', pErr);
    const meta = user.user_metadata || {};
    const base = profile || { id: user.id, email: user.email, full_name: meta.full_name || meta.name || '' };
    const sub = await supabase.from('my_subscription').select('*').maybeSingle();
    if (sub.error) console.warn('[ilogia] subscription read failed:', sub.error);
    const adm = await supabase.rpc('is_admin');
    return { ...base, isAdmin: !!adm.data, subscription: sub.data || null };
  },
  updateProfile: (id, patch) => supabase.from('profiles').update(patch).eq('id', id).then(unwrap),
};

// ---- catalogue: grades.php, subjects.php, plans.php, videos.php, library.php
export const catalogService = {
  grades: () => supabase.from('grades').select('*').order('sort_order').then(unwrap),
  subjects: () => supabase.from('subjects').select('*').order('sort_order').then(unwrap),
  plans: () => supabase.from('plans').select('*').order('sort_order').then(unwrap),
  videos: () => supabase.from('videos').select('*, grade:grades(name), subject:subjects(name,icon)').order('id').then(unwrap),
  library: () => supabase.from('library_items').select('*, grade:grades(name), subject:subjects(name,icon)').order('id').then(unwrap),
  async libraryFileUrl(item) {
    if (/^https?:\/\//.test(item.file_path)) return item.file_path;
    const { data, error } = await supabase.storage.from('library').createSignedUrl(item.file_path, 300);
    if (error) throw error; return data.signedUrl;
  },
};

// ---- payments: subscribe.php
export const paymentService = {
  subscribeFree: (planId) => supabase.rpc('activate_free_plan', { p_plan_id: planId }).then(unwrap),
  async submitReceipt(planId, method, file) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('الملف لازم يكون صورة أو PDF فقط');
    if (file.size > 5 * 1024 * 1024) throw new Error('حجم الملف أكبر من 5MB');
    const { data: { user } } = await supabase.auth.getUser();
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file.type];
    const path = `${user.id}/${Date.now()}.${ext}`;
    unwrap(await supabase.storage.from('receipts').upload(path, file, { contentType: file.type }));
    return supabase.from('subscriptions').insert({ user_id: user.id, plan_id: planId, payment_method: method, receipt_path: path }).then(unwrap);
  },
  // Live status for the student (Realtime) — pending -> active/rejected without refresh
  watchMine(userId, cb) {
    return supabase.channel('my-subs').on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` }, cb).subscribe();
  },
};

// ---- admin: api/admin/*.php (authorised by RLS + is_admin(), not by a shared key)
export const adminService = {
  subscriptions: () => supabase.from('subscriptions')
    .select('*, profile:profiles!subscriptions_user_id_fkey(full_name,email), plan:plans(name,price_label)').order('id', { ascending: false }).then(unwrap),
  users: () => supabase.from('profiles').select('id, full_name, email, created_at').order('created_at').then(unwrap),
  review: (id, action, reason) => supabase.rpc('review_subscription', { p_id: id, p_action: action, p_reason: reason ?? null }).then(unwrap),
  async receiptUrl(path) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 120);
    if (error) throw error; return data.signedUrl;
  },
  addGrade: (name, stage) => supabase.from('grades').insert({ name, stage }).then(unwrap),
  deleteGrade: (id) => supabase.from('grades').delete().eq('id', id).then(unwrap),
  addSubject: (name, icon) => supabase.from('subjects').insert({ name, icon }).then(unwrap),
  deleteSubject: (id) => supabase.from('subjects').delete().eq('id', id).then(unwrap),
  addVideo: (v) => supabase.from('videos').insert(v).then(unwrap),
  async uploadLibraryFile(meta, file) {
    const path = `${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
    unwrap(await supabase.storage.from('library').upload(path, file, { contentType: file.type }));
    return supabase.from('library_items').insert({ ...meta, file_path: path }).then(unwrap);
  },
  deleteLibraryItem: (id) => supabase.from('library_items').delete().eq('id', id).then(unwrap),
};

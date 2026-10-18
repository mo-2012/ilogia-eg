// ilogia — shared auth helpers for login.html / setup.html. Only the PUBLIC publishable key lives here;
// every permission is enforced by RLS + RPCs in Supabase (see INSTALL.md).
export const SB_URL = 'https://zugwicbbfbefbbwugfxq.supabase.co';
export const SB_KEY = 'sb_publishable_34jNpaqwtFeYboTVgO-mYw_efc0T-Ew';
export const GOOGLE_CLIENT_ID = '66022508435-ddtr9itvktnb2g9t01kicb142dseco2m.apps.googleusercontent.com';
export const $ = (s, r = document) => r.querySelector(s);
export const withTimeout = (p, ms = 20000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms))]);

export async function getClient() {
  for (const u of ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', 'https://esm.sh/@supabase/supabase-js@2.45.4']) {
    try {
      const m = await withTimeout(import(u), 15000);
      return m.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    } catch (e) { console.warn('[ilogia] could not load supabase-js from', u, e); }
  }
  return null;
}

// Only same-site targets after login (blocks open redirect via ?next=https://evil.example).
export function safeNext(raw, fallback = 'index.html') {
  try {
    if (!raw) return fallback;
    const u = new URL(raw, location.href);
    if (u.origin !== location.origin) return fallback;
    const file = u.pathname.split('/').pop().replace(/\.html$/, '');
    if (['login', 'setup'].includes(file)) return fallback;
    return (u.pathname.split('/').pop() || 'index.html') + u.search + u.hash;
  } catch { return fallback; }
}

export const isVerified = (user) => !!(user && (user.email_confirmed_at || user.confirmed_at));

const MS = {
  'Invalid login credentials': 'البريد الإلكتروني أو كلمة السر غير صحيحة',
  'Email not confirmed': 'لم يتم تأكيد بريدك بعد. افتح رسالة التأكيد التي أرسلناها إليك، أو اطلب إرسالها مرة أخرى.',
  'User already registered': 'يوجد حساب بهذا البريد بالفعل. جرّب تسجيل الدخول.',
  'Password should be at least': 'كلمة السر قصيرة جدًا.',
  'New password should be different': 'اختر كلمة سر مختلفة عن القديمة.',
  'rate limit': 'تم إرسال عدد كبير من الرسائل. انتظر قليلًا ثم حاول مرة أخرى.',
  'over_email_send_rate_limit': 'تم إرسال عدد كبير من الرسائل. انتظر قليلًا ثم حاول مرة أخرى.',
  'TIMEOUT': 'انتهت مهلة الاتصال. تحقّق من الإنترنت ثم حاول مرة أخرى.',
  'Failed to fetch': 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت ثم حاول مرة أخرى.',
  'name_required': 'اكتب اسمك الكامل (٣ أحرف على الأقل).',
  'grade_required': 'اختر صفّك الدراسي.',
  'not_authenticated': 'انتهت جلستك. سجّل الدخول من جديد.',
  'save_my_profile': 'إعداد الحساب غير مفعّل على الخادم بعد (ترحيل 010 لم يُطبَّق). تواصل مع إدارة المنصة.',
};
export function friendly(e) {
  console.error('[ilogia]', e);
  const m = String(e?.message || e || '');
  for (const k in MS) if (m.includes(k)) return MS[k];
  return 'حدث خطأ غير متوقع. حاول مرة أخرى، وإن تكرر الأمر تواصل مع الدعم.';
}

// 'setup' when the profile is not configured yet. If migration 010 is not applied (column absent) nobody is trapped.
export async function needsSetup(sb, user) {
  try {
    const { data, error } = await withTimeout(sb.from('profiles').select('onboarded_at').eq('id', user.id).maybeSingle(), 15000);
    if (error) { console.warn('[ilogia] onboarding check failed', error); return false; }
    if (!data) return true;
    if (!('onboarded_at' in data)) return false;
    return data.onboarded_at === null;
  } catch (e) { console.warn('[ilogia] onboarding check error', e); return false; }
}
export const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

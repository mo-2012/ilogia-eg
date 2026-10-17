// Routes admin.html's old api/*.php calls to Supabase. Authorization = Supabase Auth + RLS (is_admin()).
import { supabase, adminService as A, catalogService as C } from './supabase.js';

const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const num = (v) => (v ? +v : null);
const mapItem = (r) => ({ id: r.id, title: r.title, unit: r.unit, gradeId: r.grade_id, gradeName: r.grade?.name ?? null,
  subjectId: r.subject_id, subjectName: r.subject?.name ?? null, subjectIcon: r.subject?.icon ?? null,
  academicYear: r.academic_year, type: r.type, free: r.is_free, url: r.file_path });

async function route(path, init) {
  const body = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(init.body) : {};
  switch (path) {
    case 'grades.php': return { grades: await C.grades() };
    case 'subjects.php': return { subjects: await C.subjects() };
    case 'library.php': { // file_path is hidden from the public table, so admins read through an admin-only RPC
      const [rows, gs, ss] = await Promise.all([A.listLibrary(), C.grades(), C.subjects()]);
      return { items: rows.map(r => mapItem({ ...r, grade: gs.find(g => g.id === r.grade_id), subject: ss.find(s => s.id === r.subject_id) })) };
    }
    case 'admin/subscriptions.php': {
      const [subs, users] = await Promise.all([A.subscriptions(), A.users()]);
      const paths = subs.map(s => s.receipt_path).filter(Boolean);
      const signed = paths.length ? (await supabase.storage.from('receipts').createSignedUrls(paths, 3600)).data || [] : [];
      const url = Object.fromEntries(signed.map(x => [x.path, x.signedUrl]));
      const rows = subs.map(s => ({ id: s.id, status: s.status, payment_method: s.payment_method, payment_ref: s.payment_ref, sender_number: s.sender_number, amount: s.amount,
        receipt_path: s.receipt_path ? url[s.receipt_path] || null : null, created_at: s.created_at,
        reviewed_at: s.reviewed_at, expires_at: s.expires_at, user_name: s.profile?.full_name || '', user_email: s.profile?.email || '',
        plan_name: s.plan?.name, price_label: s.plan?.price_label }));
      const stats = { total: rows.length, pending: 0, active: 0, rejected: 0, expired: 0 };
      rows.forEach(r => { stats[r.status]++; });
      return { subscriptions: rows, stats, users_count: users.length,
        users: users.map(u => ({ id: u.id, name: u.full_name, email: u.email, created_at: u.created_at })) };
    }
    case 'admin/review.php': return { expires_at: await A.review(body.id, body.action, body.reason) };
    case 'admin/add_grade.php': await A.addGrade(body.name, body.stage); return {};
    case 'admin/delete_grade.php': await A.deleteGrade(body.id); return {};
    case 'admin/add_subject.php': await A.addSubject(body.name, body.icon); return {};
    case 'admin/delete_subject.php': await A.deleteSubject(body.id); return {};
    case 'admin/add_video.php':
      if (!body.title || !body.subjectId || !body.url) throw new Error('البيانات ناقصة: العنوان والمادة والرابط مطلوبين');
      await A.addVideo({ title: body.title, unit: body.unit || null, grade_id: num(body.gradeId), subject_id: num(body.subjectId),
        academic_year: body.academicYear || null, duration: body.duration || '00:00', level: body.level || 'مبتدئ', is_free: !!body.free, video_url: body.url });
      return {};
    case 'admin/add_library.php':
      if (!body.title || !body.subjectId || !body.url) throw new Error('البيانات ناقصة: العنوان والمادة والرابط مطلوبين');
      unwrap(await supabase.from('library_items').insert({ title: body.title, unit: body.unit || null, grade_id: num(body.gradeId),
        subject_id: num(body.subjectId), academic_year: body.academicYear || null, type: body.type || 'ملف PDF', is_free: !!body.free, file_path: body.url }));
      return {};
    case 'admin/delete_library.php': await A.deleteLibraryItem(body.id); return {};
    case 'admin/upload_library.php': {
      const f = body.get('file');
      const p = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${f.name.replace(/[^\w.-]/g, '_')}`;
      await uploadBig(p, f);
      return { url: p };
    }
  }
  throw new Error('unknown endpoint ' + path);
}
const unwrap = ({ data, error }) => { if (error) throw error; return data; };


// Uploads of any size: small files go through the normal call, big ones use Supabase's resumable (TUS) protocol
// in 6MB chunks, so there is no client-side size cap and an interrupted upload resumes instead of restarting.
const SB_URL = 'https://zugwicbbfbefbbwugfxq.supabase.co';
async function uploadBig(path, file) {
  if (file.size <= 6 * 1024 * 1024) return unwrap(await supabase.storage.from('library').upload(path, file, { contentType: file.type || 'application/octet-stream' }));
  const tus = await import('https://cdn.jsdelivr.net/npm/tus-js-client@4.1.0/+esm');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('سجّل الدخول الأول');
  await new Promise((resolve, reject) => {
    const up = new tus.Upload(file, {
      endpoint: SB_URL.replace('https://', 'https://').replace('.supabase.co', '.storage.supabase.co') + '/storage/v1/upload/resumable',
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: 'Bearer ' + session.access_token, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: 'library', objectName: path, contentType: file.type || 'application/octet-stream', cacheControl: '3600' },
      onError: reject,
      onSuccess: resolve,
    });
    up.findPreviousUploads().then(p => { if (p.length) up.resumeFromPreviousUpload(p[0]); up.start(); });
  });
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const m = typeof input === 'string' && input.match(/^api\/(.+)$/);
  if (!m) return realFetch(input, init);
  try { return J({ ok: true, ...(await route(m[1], init)) }); }
  catch (e) { return J({ ok: false, error: e.message || String(e) }, /permission|policy|forbidden/i.test(e.message) ? 403 : 400); }
};

// Email/password admin sign-in (replaces the shared admin key)
export async function adminSignIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('تعذّر الدخول: ' + error.message);
  if (!unwrap(await supabase.rpc('is_admin'))) { await supabase.auth.signOut(); throw new Error('هذا الحساب ليس أدمِن'); }
}
export const adminSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? unwrap(await supabase.rpc('is_admin')) : false;
};
export const adminSignOut = () => supabase.auth.signOut();

# ilogia — التثبيت والنشر والاسترجاع (المرجع الوحيد)

> البنية المعتمدة: **Supabase مباشرة من المتصفح** (Auth + RLS + RPC). لا يوجد PHP ولا مجلد `api/`، والأدمن يستخدم `admin-adapter.js`.
> المفتاح الموجود في الكود هو المفتاح العام (publishable) فقط. لا تضع مفتاح «service role» السري في أي ملف.

## 0) قبل أي شيء
1. خُذ نسخة احتياطية: Supabase → Database → Backups، وصدّر أيضًا `profiles` و`subscriptions` و`certificates` و`lesson_progress`.
2. جرّب أولًا على مشروع Supabase تجريبي (Staging) إن أمكن. **لا تشغّل SQL على الإنتاج قبل مراجعته.**

## 1) ملفات SQL (SQL Editor)
- **مشروع جديد فاضي:** `000` → `003` → `004` → `005` → `006` → `007` → `008` → `009` → `010` → `011`.
- **مشروعك الحالي (شغّال بالفعل):** شغّل `010_onboarding_and_library_lock.sql` ثم `011_audit_log.sql` فقط (011 اختياري: سجل تدقيق للموافقات والإلغاءات وتغيير الأدوار والحذف). **لا تعِد تشغيل 000.**
- كل الملفات قابلة لإعادة التشغيل، و010 لا يحذف أي صف.
- بعد 010 تأكد (الاستعلامات أسفل الملف): صف واحد فقط لسياسة `library_read` وتذكر `library_items`، وعمودا `grade_id` و`onboarded_at`، وحدود bucket الإيصالات.

## 2) إعدادات لوحة Supabase (يدويًا)
- Authentication → Providers → Email: فعّل **Confirm email**. (بدونها يدخل المستخدم بلا تأكيد.)
- Authentication → URL Configuration: Site URL = `https://ilogia-eg.com` وفي Redirect URLs أضف `https://ilogia-eg.com/**`.
- Authentication → Providers → Google: فعّله، وتأكد أن Client ID مطابق للموجود في `auth-flow.js` وأن النطاق مسموح في Google Cloud.
- (اختياري) Authentication → Policies: اجعل الحد الأدنى لكلمة السر ٨.

## 3) ترقية حسابك أدمن (مرة واحدة)
```sql
update public.profiles set is_platform_admin = true where lower(email) = lower('بريدك@هنا');
```
معلّم: `select admin_set_teacher('teacher@mail.com', true);` (من حساب أدمن) أو من لوحة الإدارة.

## 4) الرفع
ارفع كل ملفات الـ ZIP في **نفس المجلد** (الصفحات + `auth-flow.js` + `supabase.js` + `admin-adapter.js` + `ilogia-ds.css` + الصور). الروابط النظيفة: `_redirects` (Netlify/Cloudflare) أو `.htaccess` (Apache) أو `vercel.json` (Vercel). الروابط الداخلية تستخدم `.html` فتعمل على أي استضافة.

## 5) اختبارات يدوية بعد النشر (لم تُنفَّذ في بيئة التطوير)
1. زائر يفتح الموقع → يظهر `login.html` أولًا.
2. تسجيل حساب → رسالة التأكيد → فتح الرابط من الإيميل → `setup.html` → حفظ الاسم والصف → الصفحة الرئيسية.
3. دخول بإيميل غير مؤكد يُرفض. تسجيل الخروج يرجع لصفحة الدخول.
4. طالب غير مشترك: `get_video_url` لدرس مدفوع يفشل بـ `subscription_required`، وطلب Signed URL لملف مكتبة مدفوع يفشل.
5. رفع إيصال → لا يتفعّل الاشتراك → الأدمن يوافق → يتفعّل.
6. طالب لم يكمل الدروس يستدعي `claim_certificate` فيرجع `not_eligible`. إلغاء شهادة ثم فتح `verify` يعرض «ملغاة».
7. بحسابين مختلفين: لا يقرأ أحدهما إيصالات/تقدم الآخر.
8. من حساب طالب، جرّب `update profiles set is_teacher=true` و`is_platform_admin=true` على نفسك: لازم يفشل.

## 6) الاسترجاع (Rollback) لـ 010
```sql
drop trigger if exists protect_profile_email on public.profiles;
drop function if exists public.protect_profile_email();
drop function if exists public.save_my_profile(text, bigint);
-- الأعمدة (حذفها يمسح الصف والإعداد المحفوظ؛ يمكن تركها بلا ضرر):
-- alter table public.profiles drop column if exists onboarded_at, drop column if exists grade_id;
update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'receipts';
```
سياسة `library_read` تبقى كما هي (نفس تعريف 007). للرجوع الكامل: استعد النسخة الاحتياطية، وأعد رفع الـ ZIP القديم. صفحات HTML القديمة تعمل بلا 010 (لا يُحبس أحد في `setup`)، لكن «حفظ الاسم والصف» يحتاج 010.

## 6-ب) استرجاع 011
```sql
drop trigger if exists audit_subscriptions on public.subscriptions; drop trigger if exists audit_certificates on public.certificates;
drop trigger if exists audit_roles on public.profiles; drop trigger if exists audit_teacher_requests on public.teacher_requests;
drop trigger if exists audit_videos_del on public.videos; drop trigger if exists audit_library_del on public.library_items;
drop function if exists public.audit_subscriptions(), public.audit_certificates(), public.audit_roles(), public.audit_teacher_requests(), public.audit_deletes(), public.audit_write(text,text,text,jsonb), public.admin_list_audit(int);
-- drop table public.audit_log;   -- يمسح السجل نفسه
```
قراءة السجل (كأدمن، من SQL Editor): `select * from public.admin_list_audit(50);` — لم يُضَف له عرض في لوحة الإدارة بعد.

## 7) فحوص آلية
`python3 tools/check_endpoints.py` (في حزمة التطوير): يقارن استدعاءات API/RPC بما هو موجود ويبحث عن مفاتيح سرية. و`python3 tests/e2e.py` يشغّل ٤٣ فحصًا للمتصفح (يحتاج Playwright).

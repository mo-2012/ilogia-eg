# ilogia × Fawaterk — خطوات التركيب

## 1) قاعدة البيانات
شغّل `supabase/012_fawaterk.sql` في SQL Editor (قابل لإعادة التشغيل).
بعدها راجع في جدول `plans` عمود `price_egp` إن الأسعار صح (بيتحسب تلقائيًا من `price_label`).

## 2) الـ Edge Functions
```bash
supabase secrets set FAWATERK_API_KEY=xxxx SITE_URL=https://ilogia-eg.com
# للتجربة: FAWATERK_BASE_URL=https://staging.fawaterk.com/api/v2   (الافتراضي: https://app.fawaterk.com/api/v2 — اتأكد منه من لوحتك)
# انسخ سطور supabase/config.toml.snippet داخل supabase/config.toml عندك
supabase functions deploy fawaterk-create-invoice --no-verify-jwt
supabase functions deploy fawaterk-webhook --no-verify-jwt
```

## 3) الموقع
ارفع: `payment.html` و`index.html` و`vercel.json` (أو `_redirects` / `.htaccess` حسب استضافتك).

## 4) لوحة فواتيرك → Integrations (الصق الروابط دي)
| الخانة | الرابط |
|---|---|
| Success Redirect Url | `https://ilogia-eg.com/pay/success` |
| Pending Redirect Url | `https://ilogia-eg.com/pay/pending` |
| Fail Redirect Url | `https://ilogia-eg.com/pay/fail` |
| Paid transactions webhook | `https://zugwicbbfbefbbwugfxq.supabase.co/functions/v1/fawaterk-webhook/paid_json` |
| Failed transactions webhook | `https://zugwicbbfbefbbwugfxq.supabase.co/functions/v1/fawaterk-webhook/failed_json` |
| Cancellation webhook | `https://zugwicbbfbefbbwugfxq.supabase.co/functions/v1/fawaterk-webhook/cancel_json` |
| Refund transactions webhook | `https://zugwicbbfbefbbwugfxq.supabase.co/functions/v1/fawaterk-webhook/refund_json` |
| Tokenization webhook | `https://zugwicbbfbefbbwugfxq.supabase.co/functions/v1/fawaterk-webhook/token_json` |

(`_json` في آخر الرابط مطلوب عشان فواتيرك تبعت JSON.)

## 5) اختبار قبل الإنتاج (على staging)
1. ادفع بكارت تجريبي → لازم تشوف علامة صح وتتفعل الباقة.
2. `select kind, invoice_id, ok, note from fawaterk_events order by id desc;` للتأكد إن الـ webhook وصل `ok=true`.
3. `select status, payment_status from subscriptions order by id desc limit 3;` → `active / paid`.
4. لو `payment_status = paid_needs_manual` → التفعيل التلقائي فشل (راجع الملاحظة تحت) وفعّلها من لوحة الأدمن.

## ملاحظات مهمة
- التفعيل بيستدعي `review_subscription` الموجودة (بنفس منطق الأدمن) عن طريق `fawaterk_mark_paid`. أنا ما شفتش ملف `000_run_this_once.sql`، فلو قيمة الـ action عندك مختلفة عن `approve`/`approved` عدّلها في الدالة.
- الاسترجاع (refund) والإلغاء والـ token بتتسجل في `fawaterk_events` فقط؛ الاسترجاع بتراجعه يدويًا لأن الـ body مفيهوش رقم الفاتورة.
- مفتاح فواتيرك سري على السيرفر فقط، ولو اتبعت في أي شات أو مكان عام غيّره.

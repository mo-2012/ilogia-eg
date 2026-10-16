# ilogia — النسخة المدمجة

الأساس: ilearn-supabase (10) — أحدث باك إند. تم أخذ منها:
- js/supabase.js: إصلاح deadlock تسجيل الدخول + fallback لبيانات جوجل
- js/admin-adapter.js: رفع ملفات المكتبة بأي حجم (TUS resumable)
- supabase/000, 003, 004, 005 (005 يشيل حد حجم ملفات المكتبة)
- admin.html: بدون حد 50MB على الملفات
- index.html: منطق النسخة rebuilt/10 الكامل (استعادة كلمة السر، Realtime لحالة الاشتراك، Signed URLs للمكتبة، Google Sign-In) + تصميم جديد

النسخ 9 و rebuilt و fixed كانت مجموعة فرعية من 10 (قديمة أو أقل ميزات)، فلم يضف منها كود.

## التشغيل
1. Supabase SQL Editor: شغّل 000 ثم 003 ثم 004 ثم 005
2. ارفع المجلد كله مع الحفاظ على js/ بجوار admin.html

## ilogia (rename + Android sync)
- Renamed iLearn -> ilogia in UI/text/files. DB identifiers (ilearn_* policies/triggers) kept so existing Supabase setup keeps working.
- Added from Android: dark mode, study timer, completed lessons + streak ("حسابي"), FAQ/support section, Vodafone Cash number 01224561951 (InstaPay disabled).

## ilogia
- الاسم الجديد: ilogia (واجهة + عنوان + نصوص). معرّفات قاعدة البيانات (ilearn_*) والإيميل ilearnweb50@gmail.com كما هي حتى لا يتأثر Supabase.
- أيقونات متحركة (SVG): كتاب، لمبة، صاروخ، نجمة، شعلة المتابعة اليومية، كأس، قلم.
- login.gif: خلفية متحركة لنافذة الدخول. كونفيتي عند إكمال الدرس. حركة دخول للصفحة الرئيسية. تحترم prefers-reduced-motion.

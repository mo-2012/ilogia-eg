# SEO — ما اتغيّر وإيه المطلوب منك بعد الرفع

## السبب الرئيسي لعدم الظهور
`index.html` كان بيحوّل أي زائر مش مسجّل دخول (وجوجل بوت منهم) إلى `login.html`، والصفحة دي `noindex`.
فجوجل عمره ما شاف الصفحة الرئيسية.

## التعديلات
- index.html: شيل التحويل الإجباري (في الـ head وفي كود الإقلاع). الزائر غير المسجّل يشوف الصفحة العامة.
  لو الكتالوج مش متاح للزائر غير المسجّل بيظهر له زر "إنشاء حساب / دخول" بدل رسالة خطأ.
- index.html: title و description جديدين، robots، hreflang، og:locale=ar_EG، og:image alt.
- JSON-LD: لوجو PNG بدل SVG، @id، areaServed=Egypt، ربط WebSite بالمنظمة.
- teachers.html: canonical + robots + Open Graph + title/description أوضح.
- robots.txt: Allow للموقع، Disallow لـ /admin و /crm فقط. باقي الصفحات الخاصة عليها noindex.
- sitemap.xml: lastmod وشيل changefreq/priority (جوجل بيتجاهلهم).

## بعد الرفع
1. ارفع الملفات على الاستضافة (ilogia-eg.com).
2. Google Search Console: أضف Domain property لـ ilogia-eg.com وتحقّق منها بـ DNS TXT.
3. Sitemaps > ضيف https://ilogia-eg.com/sitemap.xml.
4. URL Inspection على https://ilogia-eg.com/ > Test Live URL > Request Indexing.
5. كرر نفس الخطوات في Bing Webmaster Tools (يمكن استيراد الموقع من Search Console).
6. اتأكد إن الدومين الثاني (www) بيعمل 301 للنسخة الأساسية.

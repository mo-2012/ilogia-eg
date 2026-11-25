/* ilogia — سلوك الموبايل/التطبيق المشترك. سكربت عادي (غير module) يُحمَّل في <head> قبل أي شيء.
   - يضيف class="app" على <html> داخل تطبيق الأندرويد (الـ User-Agent فيه IlogiaApp)
   - زر الرجوع في الأندرويد يغلق النافذة المفتوحة بدل ما يطلّعك من الصفحة
   - يوقف السحب للتحديث (Pull-to-refresh) أثناء فتح نافذة
   - يظبط حالة الشريط السفلي ويمنع تكرار سجلّ المتصفح
   - مساعدات: ilogiaOpenUrl / ilogiaSave / ilogiaCopy تتعامل مع جسر التطبيق إن وُجد */
(function () {
  var d = document, de = d.documentElement;
  var inApp = /IlogiaApp/.test(navigator.userAgent);
  if (inApp) de.classList.add('app');
  window.ILOGIA_IN_APP = inApp;
  var nb = function () { return window.IlogiaApp || null; };

  window.ilogiaOpenUrl = function (url) {            // فتح ملف/رابط خارجي (PDF من المكتبة مثلًا)
    var b = nb();
    if (b && b.openUrl) { b.openUrl(String(url)); return true; }
    return false;
  };
  window.ilogiaSave = function (name, mime, base64) { // حفظ ملف مولَّد داخل الصفحة (شهادة PNG/PDF)
    var b = nb();
    if (b && b.saveBase64) { b.saveBase64(String(name), String(mime), String(base64)); return true; }
    return false;
  };
  window.ilogiaCopy = function (text) {
    try { return navigator.clipboard.writeText(text); } catch (e) { }
    return new Promise(function (ok, no) {
      try {
        var t = d.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;inset-block-start:0';
        d.body.appendChild(t); t.select(); var r = d.execCommand('copy'); t.remove(); r ? ok() : no(new Error('copy'));
      } catch (x) { no(x); }
    });
  };

  var ptr = function (on) { try { var b = nb(); b && b.setRefreshEnabled && b.setRefreshEnabled(!!on); } catch (e) { } };

  // ---- النوافذ (dialog): زر الرجوع يغلقها + إيقاف السحب للتحديث أثناء فتحها ----
  if (window.HTMLDialogElement && !HTMLDialogElement.prototype.__ilPatched) {
    var sm = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.__ilPatched = true;
    HTMLDialogElement.prototype.showModal = function () {
      var me = this; sm.call(me); ptr(false);
      try { history.pushState({ ilDlg: 1 }, ''); } catch (e) { }
      me.addEventListener('close', function () {
        ptr(!d.querySelector('dialog[open]'));
        if (history.state && history.state.ilDlg && !me.__bk) { try { history.back(); } catch (e) { } }
      }, { once: true });
    };
    addEventListener('popstate', function () {
      var o = d.querySelector('dialog[open]'); if (o) { o.__bk = 1; o.close(); }
    });
  }

  // ---- الشريط السفلي ----
  function initTabs() {
    var tabs = [].slice.call(d.querySelectorAll('.tabbar a[data-sec]'));
    if (!tabs.length) return;
    var secs = tabs.map(function (a) { var id = a.getAttribute('data-sec'); return id ? d.getElementById(id) : null; });
    var onIndex = !!d.getElementById('videos');
    var cur = -1, raf = 0;
    function mark(i) {
      if (i === cur) return; cur = i;
      tabs.forEach(function (a, k) { if (k === i) a.setAttribute('aria-current', 'page'); else if (!a.hasAttribute('data-fixed')) a.removeAttribute('aria-current'); });
    }
    function upd() {
      raf = 0; var y = innerHeight * 0.38, c = 0;
      secs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= y) c = i; });
      if (innerHeight + scrollY >= d.documentElement.scrollHeight - 4 && secs[3]) c = Math.max(c, 3);
      mark(c);
    }
    if (onIndex) {
      addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
      addEventListener('resize', upd); upd();
      tabs.forEach(function (a) {
        a.addEventListener('click', function (e) {
          var href = a.getAttribute('href') || '';
          if (href.charAt(0) !== '#') return;
          e.preventDefault();
          var id = a.getAttribute('data-sec'), t = id ? d.getElementById(id) : null;
          if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); else scrollTo({ top: 0, behavior: 'smooth' });
          try { history.replaceState(null, '', location.pathname + location.search + (id ? '#' + id : '')); } catch (x) { }
        });
      });
    }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', initTabs); else initTabs();
})();

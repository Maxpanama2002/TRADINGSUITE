// Theme + Language toggle for Trading Suite landing.
(function(){
  var THEME_KEY = 'ts-site-theme';
  var LANG_KEY  = 'ts-site-lang';

  // ── Theme ─────────────────────────────────────────────────────────────────
  function getInitialTheme(){
    try { var s = localStorage.getItem(THEME_KEY); if(s === 'light' || s === 'dark') return s; } catch(e){}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  }

  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch(e){}
    // Sync to app key so /app/ picks up the same choice (same origin localStorage)
    try { localStorage.setItem('app_theme', theme); } catch(e){}
  }

  // ── Language ──────────────────────────────────────────────────────────────
  function getInitialLang(){
    try { var s = localStorage.getItem(LANG_KEY); if(s === 'en' || s === 'ru') return s; } catch(e){}
    return 'en';
  }

  function applyLang(lang){
    document.documentElement.setAttribute('lang', lang);
    try { localStorage.setItem(LANG_KEY, lang); } catch(e){}
    try { localStorage.setItem('app_lang', lang); } catch(e){}
    // Swap text on every element that has data-ru / data-en
    document.querySelectorAll('[data-ru]').forEach(function(el){
      el.innerHTML = lang === 'en' ? (el.dataset.en || el.dataset.ru) : el.dataset.ru;
    });
    // Update lang toggle label: shows the CURRENT active language
    document.querySelectorAll('.lang-toggle').forEach(function(b){
      b.textContent = lang === 'ru' ? 'RU' : 'EN';
    });
  }

  // Apply theme immediately (before DOM ready) to avoid flash
  applyTheme(getInitialTheme());

  // Screenshot onerror fallback (legacy single-shot support)
  window._shotErr = function(img){
    if(img.dataset.tried === 'png'){
      img.dataset.tried = 'jpg';
      img.src = img.src.replace(/\.png(\?.*)?$/, '.jpg?t=' + Date.now());
    } else {
      img.classList.add('failed');
    }
  };

  // ── Wire up after DOM ready ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function(){

    // Theme toggles (multiple pages may have one)
    document.querySelectorAll('.theme-toggle').forEach(function(b){
      b.addEventListener('click', function(){
        var cur = document.documentElement.getAttribute('data-theme');
        applyTheme(cur === 'light' ? 'dark' : 'light');
      });
    });

    // Language toggles
    document.querySelectorAll('.lang-toggle').forEach(function(b){
      b.addEventListener('click', function(){
        var cur = document.documentElement.getAttribute('lang') || getInitialLang();
        applyLang(cur === 'ru' ? 'en' : 'ru');
      });
    });

    // Apply initial language (needs DOM ready for querySelectorAll)
    applyLang(getInitialLang());
  });
})();

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

  var LANGS = [
    {code:'en', label:'English', flag:'🇬🇧'},
    {code:'ru', label:'Русский', flag:'🇷🇺'}
  ];

  function applyLang(lang){
    document.documentElement.setAttribute('lang', lang);
    try { localStorage.setItem(LANG_KEY, lang); } catch(e){}
    try { localStorage.setItem('app_lang', lang); } catch(e){}
    // Swap text on every element that has data-ru / data-en
    document.querySelectorAll('[data-ru]').forEach(function(el){
      el.innerHTML = lang === 'en' ? (el.dataset.en || el.dataset.ru) : el.dataset.ru;
    });
    // Update toggle label + active state in open menus
    document.querySelectorAll('.lang-toggle').forEach(function(b){
      var lbl = b.querySelector('.lang-toggle-lbl');
      if(lbl) lbl.textContent = lang.toUpperCase();
    });
    document.querySelectorAll('.lang-menu-item').forEach(function(item){
      item.classList.toggle('active', item.dataset.lang === lang);
    });
  }

  // ── Build chevron SVG ─────────────────────────────────────────────────────
  function _chevron(){
    var s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('width','11'); s.setAttribute('height','11');
    s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
    s.setAttribute('stroke','currentColor'); s.setAttribute('stroke-width','2.5');
    s.setAttribute('stroke-linecap','round'); s.setAttribute('stroke-linejoin','round');
    var p = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    p.setAttribute('points','6 9 12 15 18 9'); s.appendChild(p);
    return s;
  }

  // ── Dropdown logic ────────────────────────────────────────────────────────
  var _langMenu = null;
  var _langBtn  = null;

  function _closeLangMenu(){
    if(_langMenu){ _langMenu.classList.remove('open'); }
    if(_langBtn) { _langBtn.classList.remove('open'); }
  }

  function _openLangMenu(btn){
    if(!_langMenu){
      _langMenu = document.createElement('div');
      _langMenu.className = 'lang-menu';
      LANGS.forEach(function(l){
        var item = document.createElement('div');
        item.className = 'lang-menu-item' + (l.code === getInitialLang() ? ' active' : '');
        item.dataset.lang = l.code;
        item.innerHTML = '<span class="lang-flag">'+l.flag+'</span>'+l.label;
        item.addEventListener('click', function(e){
          e.stopPropagation();
          applyLang(l.code);
          _closeLangMenu();
        });
        _langMenu.appendChild(item);
      });
      document.body.appendChild(_langMenu);
    }
    // Position below button
    var r = btn.getBoundingClientRect();
    _langMenu.style.top  = (r.bottom + 6) + 'px';
    _langMenu.style.left = Math.max(4, r.right - 130) + 'px';
    _langBtn = btn;
    btn.classList.add('open');
    requestAnimationFrame(function(){ _langMenu.classList.add('open'); });
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

    // Language toggles — enhance button markup + open dropdown on click
    document.querySelectorAll('.lang-toggle').forEach(function(b){
      // Inject label span + chevron if the button only has plain text
      if(!b.querySelector('.lang-toggle-lbl')){
        b.innerHTML = '';
        var lbl = document.createElement('span');
        lbl.className = 'lang-toggle-lbl';
        lbl.textContent = (getInitialLang() || 'en').toUpperCase();
        b.appendChild(lbl);
        b.appendChild(_chevron());
      }
      b.addEventListener('click', function(e){
        e.stopPropagation();
        if(_langMenu && _langMenu.classList.contains('open')){
          _closeLangMenu();
        } else {
          _openLangMenu(b);
        }
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(){ _closeLangMenu(); });

    // Apply initial language (needs DOM ready for querySelectorAll)
    applyLang(getInitialLang());
  });
})();

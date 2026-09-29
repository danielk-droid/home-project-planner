// Presentation-only light/dark toggle. No storage, no network.
(function(){
  var root=document.documentElement;
  var mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
  if(mq&&mq.matches)root.classList.add('theme-dark');
  function label(b){var d=root.classList.contains('theme-dark');b.setAttribute('aria-pressed',String(d));b.setAttribute('aria-label',d?'Switch to light appearance':'Switch to dark appearance');}
  document.addEventListener('DOMContentLoaded',function(){
    var b=document.getElementById('themeToggle');if(!b)return;label(b);
    b.addEventListener('click',function(){root.classList.toggle('theme-dark');label(b);});
  });
  // Expand collapsed report sections so printed plans stay complete.
  window.addEventListener('beforeprint',function(){document.querySelectorAll('details.report-disclosure').forEach(function(d){d.open=true;});});
})();

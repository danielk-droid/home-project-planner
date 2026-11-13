(function(){
  var $=function(id){return document.getElementById(id)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var fmt=function(n){return n==null?'—':Number(n).toLocaleString()};
  var label=function(s){return String(s).replace(/[-_]/g,' ').replace(/^./,function(c){return c.toUpperCase()})};
  var identity=function(s){return s};
  var sourceLabel=function(s){return ({ai:'AI tools',not_recorded:'Not recorded yet',internal:'Within HPP'})[s]||label(s)};
  var KEY='hpp-insights-pass';

  async function load(pass){
    $('gateMsg').textContent='Loading…';
    var res, data;
    try{ res=await fetch('/api/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passcode:pass})}); data=await res.json(); }
    catch(e){ $('gateMsg').textContent='Could not reach the server.'; return; }
    if(!res.ok){ sessionStorage.removeItem(KEY); showGate(); $('gateMsg').textContent=data.message||data.error||'Could not unlock.'; return; }
    sessionStorage.setItem(KEY,pass); render(data);
  }
  function showGate(){ $('gate').classList.remove('hidden'); $('dash').classList.add('hidden'); $('lock').classList.add('hidden'); }
  function bars(obj,names){
    var e=Object.entries(obj||{}).sort(function(a,b){return b[1]-a[1]}); if(!e.length) return '<p class="muted">Nothing recorded yet.</p>';
    var max=e[0][1], name=names||label;
    return e.slice(0,8).map(function(x){return '<div class="bar"><b>'+esc(name(x[0]))+'</b><em>'+fmt(x[1])+'</em><div><i style="width:'+Math.round(x[1]/max*100)+'%"></i></div></div>'}).join('');
  }
  function kpi(n,l,d){return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+l+'</div>'+(d?'<div class="d">'+d+'</div>':'')+'</div>'}
  function prettyDate(iso){return new Date(iso+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}
  function dayAria(x){return prettyDate(x.date)+': '+fmt(x.visits)+' visits, '+fmt(x.newVisitors)+' new, '+fmt(x.returningVisitors)+' returning, '+fmt(x.projects)+' projects started, '+fmt(x.plansGenerated)+' plans finished'}
  function dayDetail(x){
    return '<strong>'+esc(prettyDate(x.date))+'</strong><div class="day-metrics"><span><b>'+fmt(x.visits)+'</b> visits</span><span><b>'+fmt(x.newVisitors)+'</b> new</span><span><b>'+fmt(x.returningVisitors)+'</b> returning</span><span><b>'+fmt(x.projects)+'</b> projects started</span><span><b>'+fmt(x.plansGenerated)+'</b> plans finished</span></div>';
  }
  function queryTable(rows){
    if(!rows||!rows.length) return '<p class="muted">No search terms reported yet.</p>';
    return '<div class="table-scroll"><table class="data-table"><thead><tr><th>Search term</th><th>Clicks</th><th>Shown</th><th>CTR</th><th>Position</th></tr></thead><tbody>'+rows.map(function(q){return '<tr><td>'+esc(q.q)+'</td><td>'+fmt(q.clicks)+'</td><td>'+fmt(q.impressions)+'</td><td>'+fmt(q.ctr)+'%</td><td>'+(q.position||'—')+'</td></tr>'}).join('')+'</tbody></table></div>';
  }
  function pageTable(rows){
    if(!rows||!rows.length) return '<p class="muted">No search landing pages reported yet.</p>';
    return '<div class="table-scroll"><table class="data-table pages"><thead><tr><th>Page</th><th>Clicks</th><th>Shown</th></tr></thead><tbody>'+rows.map(function(p){return '<tr><td>'+esc(p.page)+'</td><td>'+fmt(p.clicks)+'</td><td>'+fmt(p.impressions)+'</td></tr>'}).join('')+'</tbody></table></div>';
  }
  function render(d){
    $('gate').classList.add('hidden'); $('dash').classList.remove('hidden'); $('lock').classList.remove('hidden');
    var t=d.totals,w=d.last7,r=d.rates,s=d.search;
    $('stamp').textContent='Updated '+new Date(d.generatedAt).toLocaleString()+(d.trackingSince?' · Counting since '+d.trackingSince:' · Counting starts with the next visit');
    $('kpis').innerHTML=[
      kpi(fmt(t.newVisitors),'New visitors','+'+fmt(w.newVisitors)+' this week'),
      kpi(fmt(t.visits),'Total visits','+'+fmt(w.visits)+' this week'),
      kpi(fmt(t.projectsStarted),'Projects started','+'+fmt(w.projectsStarted)+' this week'),
      kpi(fmt(t.plansGenerated),'Plans finished',r.completion==null?'':r.completion+'% of started'),
      kpi(r.returning==null?'—':r.returning+'%','Returning visitors',fmt(t.projectsResumed)+' saved projects reopened'),
      kpi(fmt(t.feedback),'Feedback forms','+'+fmt(w.feedback)+' this week')
    ].join('');

    var max=Math.max(1,...d.daily.map(function(x){return Math.max(x.visits,x.projects)}));
    var pinnedDay=null;
    $('chart').innerHTML=d.daily.map(function(x,i){
      return '<button type="button" class="day" data-day="'+i+'" aria-label="'+esc(dayAria(x))+'">'+
        '<span class="bars" aria-hidden="true"><i style="height:'+(x.visits/max*100)+'%"></i><i class="p" style="height:'+(x.projects/max*100)+'%"></i></span>'+
        (i%2?'':'<span class="date" aria-hidden="true">'+x.date.slice(5)+'</span>')+
        '<span class="tip" aria-hidden="true"><strong>'+esc(prettyDate(x.date))+'</strong><span>'+fmt(x.visits)+' visits · '+fmt(x.projects)+' projects</span><span>'+fmt(x.newVisitors)+' new · '+fmt(x.returningVisitors)+' returning</span><span>'+fmt(x.plansGenerated)+' plans finished</span></span></button>';
    }).join('');
    function showDay(i){$('dayDetail').innerHTML=dayDetail(d.daily[i])}
    function restoreDay(){showDay(pinnedDay==null?d.daily.length-1:pinnedDay)}
    $('chart').querySelectorAll('.day').forEach(function(btn){
      var i=Number(btn.getAttribute('data-day'));
      btn.addEventListener('mouseenter',function(){showDay(i)});
      btn.addEventListener('focus',function(){showDay(i)});
      btn.addEventListener('click',function(){
        pinnedDay=pinnedDay===i?null:i;
        $('chart').querySelectorAll('.day').forEach(function(x){x.classList.toggle('active',Number(x.getAttribute('data-day'))===pinnedDay)});
        showDay(i);
      });
    });
    $('chart').addEventListener('mouseleave',restoreDay);
    $('chart').addEventListener('focusout',function(){setTimeout(function(){if(!$('chart').contains(document.activeElement))restoreDay()},0)});
    restoreDay();

    $('sources').innerHTML=bars(d.sources,sourceLabel);
    $('referrers').innerHTML=bars(d.referrers,identity);
    $('entryPages').innerHTML=bars(d.landingPages,identity);
    if(s.ok){
      $('search').innerHTML='<p class="muted search-range">'+esc(s.start)+' to '+esc(s.end)+'</p><div class="mini"><div>'+fmt(s.clicks)+'<small>clicks</small></div><div>'+fmt(s.impressions)+'<small>times shown</small></div><div>'+s.ctr+'%<small>click rate</small></div><div>'+(s.position||'—')+'<small>avg. position</small></div></div>'+
        '<div class="search-grid"><section><h3>Search terms</h3>'+queryTable(s.queries)+'</section><section><h3>Pages people find</h3>'+pageTable(s.pages)+'</section></div><p class="muted table-note">Google hides some low-volume searches and usually takes 2–3 days to report new data. Position 1 is the top result.</p>';
    } else {
      $('search').innerHTML='<p class="muted">Google Search isn\'t connected to this page yet. In Search Console → Settings → Users and permissions → Add user, add <b>'+esc(s.serviceAccount)+'</b> with “Restricted” access. Numbers appear here after that.</p>';
    }
    $('types').innerHTML=bars(d.projectTypes);
    $('roles').innerHTML=bars(d.roles)+(r.useful==null?'':'<p class="muted">'+r.useful+'% found HPP very or somewhat useful.</p>');
    $('recent').innerHTML=d.recentFeedback.length?d.recentFeedback.map(function(f){return '<div class="fb">'+esc(f.text)+'<small>'+esc(f.date)+' · '+esc(f.role)+' · '+esc(f.usefulness)+'</small></div>'}).join(''):'<p class="muted">No feedback yet.</p>';
    var notes=[];
    if(r.completion!=null) notes.push(r.completion>=50?r.completion+'% of people who start a project finish a plan — strong.':'Only '+r.completion+'% of started projects reach a finished plan — the question flow may be too long.');
    if(r.returning!=null) notes.push(r.returning+'% of visits come from people who were here before.');
    if(s.ok&&s.impressions) notes.push('Google showed your pages '+fmt(s.impressions)+' times; '+(s.ctr<2?'a low click rate means titles could be more direct.':'your click rate is healthy.'));
    var top=Object.entries(d.projectTypes||{}).sort(function(a,b){return b[1]-a[1]})[0]; if(top) notes.push('Most planned project: '+label(top[0])+'. Guides on this topic are your best bet for more traffic.');
    var topSource=Object.entries(d.sources||{}).filter(function(x){return x[0]!=='not_recorded'&&x[0]!=='internal'}).sort(function(a,b){return b[1]-a[1]})[0];
    if(topSource) notes.push('Your largest recorded acquisition source is '+sourceLabel(topSource[0]).toLowerCase()+' with '+fmt(topSource[1])+' visits.');
    if(d.sources&&d.sources.ai) notes.push('AI tools have brought '+fmt(d.sources.ai)+' visits. Check the referring sites and entry pages to see what they recommend.');
    if(!notes.length) notes.push('Not enough data yet. Check back in a few days.');
    $('notes').innerHTML=notes.map(function(n){return '<li>'+esc(n)+'</li>'}).join('');
    $('resume').textContent='Built and launched Home Project Planner, a free zoning and permit planning tool for Newton, MA, with '+fmt(t.newVisitors)+' visitors, '+fmt(t.projectsStarted)+' projects started'+(s.ok?', and '+fmt(s.impressions)+' Google search impressions in 28 days':'')+'.';
  }
  $('gate').addEventListener('submit',function(e){e.preventDefault();load($('pass').value)});
  $('lock').addEventListener('click',function(){sessionStorage.removeItem(KEY);$('pass').value='';showGate();$('gateMsg').textContent=''});
  $('copy').addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText($('resume').textContent);$('copy').textContent='Copied'});
  var saved=sessionStorage.getItem(KEY); if(saved) load(saved);
})();

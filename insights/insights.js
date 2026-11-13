(function(){
  var $=function(id){return document.getElementById(id)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var fmt=function(n){return n==null?'—':Number(n).toLocaleString()};
  var label=function(s){return String(s).replace(/[-_]/g,' ').replace(/^./,function(c){return c.toUpperCase()})};
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
  function bars(obj){
    var e=Object.entries(obj||{}).sort(function(a,b){return b[1]-a[1]}); if(!e.length) return '<p class="muted">Nothing yet.</p>';
    var max=e[0][1];
    return e.slice(0,8).map(function(x){return '<div class="bar"><b>'+esc(label(x[0]))+'</b><em>'+fmt(x[1])+'</em><div><i style="width:'+Math.round(x[1]/max*100)+'%"></i></div></div>'}).join('');
  }
  function kpi(n,l,d){return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+l+'</div>'+(d?'<div class="d">'+d+'</div>':'')+'</div>'}
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
    $('chart').innerHTML=d.daily.map(function(x,i){return '<div class="day" title="'+x.date+': '+x.visits+' visits, '+x.projects+' projects"><i style="height:'+(x.visits/max*100)+'%"></i><i class="p" style="height:'+(x.projects/max*100)+'%"></i>'+(i%2?'':'<span>'+x.date.slice(5)+'</span>')+'</div>'}).join('');
    if(s.ok){
      $('search').innerHTML='<div class="mini"><div>'+fmt(s.clicks)+'<small>clicks</small></div><div>'+fmt(s.impressions)+'<small>times shown</small></div><div>'+s.ctr+'%<small>click rate</small></div><div>'+(s.position||'—')+'<small>avg. position</small></div></div>'+
        (s.queries.length?'<table>'+s.queries.map(function(q){return '<tr><td>'+esc(q.q)+'</td><td>'+fmt(q.impressions)+' shown · '+fmt(q.clicks)+' clicks</td></tr>'}).join('')+'</table>':'<p class="muted">No search terms reported yet.</p>');
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
    if(!notes.length) notes.push('Not enough data yet. Check back in a few days.');
    $('notes').innerHTML=notes.map(function(n){return '<li>'+esc(n)+'</li>'}).join('');
    $('resume').textContent='Built and launched Home Project Planner, a free zoning and permit planning tool for Newton, MA, with '+fmt(t.newVisitors)+' visitors, '+fmt(t.projectsStarted)+' projects started'+(s.ok?', and '+fmt(s.impressions)+' Google search impressions in 28 days':'')+'.';
  }
  $('gate').addEventListener('submit',function(e){e.preventDefault();load($('pass').value)});
  $('lock').addEventListener('click',function(){sessionStorage.removeItem(KEY);$('pass').value='';showGate();$('gateMsg').textContent=''});
  $('copy').addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText($('resume').textContent);$('copy').textContent='Copied'});
  var saved=sessionStorage.getItem(KEY); if(saved) load(saved);
})();

import {PROJECTS,resolveProperty,buildPlan,sourcesFor} from './src/core.js';
const $=id=>document.getElementById(id);
let property=null, type=null;
$('resolve').onclick=async()=>{
  $('error').classList.add('hidden'); $('resolve').disabled=true; $('resolve').textContent='Resolving…';
  try { property=await resolveProperty($('address').value); type=$('projectType').value; renderQuestions(); }
  catch(e){$('error').textContent=e.message;$('error').classList.remove('hidden');}
  finally {$('resolve').disabled=false;$('resolve').textContent='Resolve property & continue';}
};
function renderQuestions(){
  $('start').classList.add('hidden'); const q=$('questions'); q.classList.remove('hidden');
  const qs=PROJECTS[type].questions;
  q.innerHTML=`<div class="eyebrow">PROPERTY RESOLVED</div><h2>${escape(property.resolvedAddress)}</h2><div class="facts">${property.evidence.map(x=>`<span><b>${escape(x.label)}</b>${escape(String(x.value))}</span>`).join('')}</div><h1>Tell us about the project</h1><p class="muted">These questions are limited to facts that can change the workflow.</p><form id="qform">${qs.map(([key,text,kind])=>kind==='boolean'?'<label>'+escape(text)+'<select name="'+key+'"><option value="false">No</option><option value="true">Yes</option></select></label>':'<label>'+escape(text)+'<input name="'+key+'" type="number" min="0" step="any"></label>').join('')}<button>Generate project plan</button></form>`;
  $('qform').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),a={};for(const [k,v] of fd)a[k]=v==='true'?true:v===''?null:(/^\d+(\.\d+)?$/.test(v)?Number(v):v);renderResult(buildPlan(type,property,a));};
}
function renderResult(plan){
 $('questions').classList.add('hidden');const r=$('result');r.classList.remove('hidden');
 const savedKey='nhpp-project';
 const saved=JSON.parse(localStorage.getItem(savedKey)||'null');
 if(saved) plan.steps=plan.steps.map((x,i)=>({...x,status:saved.steps?.[i]?.status||'not_started'}));
 localStorage.setItem(savedKey,JSON.stringify({type,property,steps:plan.steps,updatedAt:new Date().toISOString()}));
 const statusClass=s=>s==='required'?'required':s==='potentially_required'?'conditional':'confirm';
 r.innerHTML=`<section class="panel"><div class="eyebrow">PROJECT PLAN</div><h1>${escape(PROJECTS[type].label)}</h1><p class="muted">${escape(property.resolvedAddress)} · ${escape(property.zoningDistrict||'Zoning not resolved')}</p><div class="notice">This is a planning aid, not a permit approval or code-compliance determination. Items marked <b>Needs confirmation</b> require additional facts or official confirmation.</div></section>
 <section class="panel"><h2>What the engine found</h2>${plan.results.map(x=>`<article class="result ${statusClass(x.status)}"><div><span class="badge">${x.status.replaceAll('_',' ')}</span><h3>${escape(x.title)}</h3><p>${escape(x.action)}</p><p class="small">${escape(x.explanation||'')}</p></div><div class="sources">${sourcesFor(x).map(s=>`<a href="${s.url}" target="_blank" rel="noreferrer">${escape(s.title)}</a>`).join('')}</div></article>`).join('')}</section>
 <section class="panel"><h2>Project sequence</h2><p class="small">Your progress is saved in this browser for this prototype.</p><ol class="steps">${plan.steps.map((s,i)=>`<li><label class="stepcheck"><input data-step="${i}" type="checkbox" ${s.status==='complete'?'checked':''}> <b>${i+1}. ${escape(s.title)}</b></label><span>Depends on: ${s.dependsOn.length?s.dependsOn.join(', '):'project scope'}</span></li>`).join('')}</ol></section>
 <section class="panel"><h2>Property evidence</h2><div class="facts">${property.evidence.map(x=>`<span><b>${escape(x.label)}</b>${escape(String(x.value))}</span>`).join('')}</div><p class="small">Property facts shown here come from Newton's official GIS layers. GIS evidence does not by itself determine permit approval.</p></section>
 <button id="restart">Start another project</button>`;
 document.querySelectorAll('[data-step]').forEach(cb=>cb.onchange=()=>{const current=JSON.parse(localStorage.getItem(savedKey)||'{}');current.steps=current.steps||plan.steps;current.steps[Number(cb.dataset.step)].status=cb.checked?'complete':'not_started';current.updatedAt=new Date().toISOString();localStorage.setItem(savedKey,JSON.stringify(current));});
 $('restart').onclick=()=>location.reload();
}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
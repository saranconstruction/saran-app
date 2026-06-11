const $ = (id)=>document.getElementById(id);
const KEY='saranAppV32';
const todayISO=()=>new Date().toISOString().slice(0,10);
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{
 jobs:[
  {id:crypto.randomUUID(),name:'Virginie',address:'Adresse à ajouter',phone:'',notes:'PVC SJC + pieux',color:'#111111'},
  {id:crypto.randomUUID(),name:'Cécile Vette',address:'Adresse à ajouter',phone:'',notes:'Reposer le Vénus',color:'#555555'},
  {id:crypto.randomUUID(),name:'Guy Bergeron',address:"248 d'Allier",phone:'',notes:'Pieux',color:'#888888'}
 ],events:[],expenses:[],punches:[],activePunch:null
};
if(!state.events.length){const y=new Date().getFullYear();state.events=[
 {id:crypto.randomUUID(),title:'Virginie — planter les pieux',date:`${y}-06-12`,time:'08:00',type:'Chantier',jobName:'Virginie',notes:'Horaire à confirmer'},
 {id:crypto.randomUUID(),title:'Cécile Vette — reposer le Vénus',date:`${y}-06-12`,time:'08:00',type:'Chantier',jobName:'Cécile Vette',notes:'Horaire à confirmer'},
 {id:crypto.randomUUID(),title:"Guy Bergeron — pieux au 248 d'Allier",date:`${y}-06-15`,time:'08:00',type:'Chantier',jobName:'Guy Bergeron',notes:'Horaire à confirmer'},
];save()}
let calDate=new Date(); let view='month'; let editingEventId=null; let selectedDay=null; let editingJobId=null;
function save(){localStorage.setItem(KEY,JSON.stringify(state));}
function getJob(name){return state.jobs.find(j=>j.name===name)}
function jobColor(name){return (getJob(name)||{}).color||'#111111'}
function fmtMoney(n){return (Number(n)||0).toLocaleString('fr-CA',{minimumFractionDigits:2,maximumFractionDigits:2})+' $'}
function fmtDate(iso){return new Date(iso+'T12:00:00').toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long'});}
function screen(name){document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===name));document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.screen===name));render();}
document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>screen(b.dataset.screen));
function render(){renderSelects();renderToday();renderJobs();renderExpenses();renderPunches();renderCalendar();}
function renderSelects(){['punchJob','expenseJob','eventJob'].forEach(id=>{const el=$(id); if(!el)return; const cur=el.value; el.innerHTML='<option value="">Aucun chantier lié</option>'+state.jobs.map(j=>`<option value="${esc(j.name)}">${esc(j.name)}</option>`).join(''); el.value=cur;});}
function renderToday(){const list=$('todayList'); const d=todayISO(); const events=state.events.filter(e=>e.date===d).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99')); list.innerHTML=events.length?events.map(eventCard).join(''):'<div class="event-card"><b>Aucune tâche aujourd’hui.</b><p class="muted">Ajoute un chantier ou un rappel dans le calendrier.</p></div>';}
function jobTotals(name){return state.expenses.filter(e=>e.jobName===name).reduce((a,e)=>a+Number(e.amount||0),0)}
function renderJobs(){const list=$('jobsList'); list.innerHTML=state.jobs.map(j=>`<div class="job-card" style="border-left:8px solid ${esc(j.color||'#111111')}"><div class="card-title"><span class="color-dot" style="background:${esc(j.color||'#111111')}"></span>${esc(j.name)}</div><p class="muted">${esc(j.address||'Adresse à ajouter')}</p><p>${esc(j.notes||'')}</p><b>Dépenses: ${fmtMoney(jobTotals(j.name))}</b><div class="chips"><span class="chip">${state.events.filter(e=>e.jobName===j.name).length} événements</span><span class="chip">${state.expenses.filter(e=>e.jobName===j.name).length} factures</span></div><button onclick="editJob('${j.id}')">Modifier</button><button class="darkBtn" onclick="addJobToCalendar('${j.id}')">Ajouter au calendrier</button><button class="danger" onclick="deleteJob('${j.id}')">Supprimer</button></div>`).join('');}
function clearJobForm(){['jobName','jobAddress','jobPhone','jobNotes'].forEach(id=>$(id).value=''); $('jobColor').value='#111111'; editingJobId=null; $('createJobBtn').textContent='CRÉER CHANTIER'; $('cancelJobEditBtn').style.display='none';}
function createJob(){const name=$('jobName').value.trim(); if(!name){alert('Ajoute un nom de chantier.');return} const old=editingJobId?state.jobs.find(j=>j.id===editingJobId):null; const obj={id:editingJobId||crypto.randomUUID(),name,address:$('jobAddress').value.trim(),phone:$('jobPhone').value.trim(),notes:$('jobNotes').value.trim(),color:$('jobColor').value||'#111111'}; if(editingJobId){state.jobs=state.jobs.map(j=>j.id===editingJobId?obj:j); if(old&&old.name!==obj.name){state.events=state.events.map(e=>e.jobName===old.name?{...e,jobName:obj.name}:e); state.expenses=state.expenses.map(e=>e.jobName===old.name?{...e,jobName:obj.name}:e);}}else{state.jobs.push(obj)} clearJobForm(); save(); render();}
$('createJobBtn').onclick=createJob; $('cancelJobEditBtn').onclick=clearJobForm;
window.editJob=(id)=>{const j=state.jobs.find(x=>x.id===id); if(!j)return; editingJobId=id; $('jobName').value=j.name||''; $('jobAddress').value=j.address||''; $('jobPhone').value=j.phone||''; $('jobNotes').value=j.notes||''; $('jobColor').value=j.color||'#111111'; $('createJobBtn').textContent='SAUVEGARDER CHANTIER'; $('cancelJobEditBtn').style.display='block'; window.scrollTo({top:0,behavior:'smooth'});};
window.addJobToCalendar=(id)=>{const j=state.jobs.find(x=>x.id===id); if(!j)return; screen('calendar'); openEvent({title:j.name+' — chantier',type:'Chantier',jobName:j.name,notes:j.address||j.notes||'',date:selectedDay||todayISO()});};
window.deleteJob=(id)=>{if(confirm('Supprimer ce chantier? Les événements et factures restent, mais ne seront plus liés au chantier.')){state.jobs=state.jobs.filter(j=>j.id!==id);save();render();}}
function renderExpenses(){const list=$('expensesList'); list.innerHTML=state.expenses.slice().reverse().map(e=>`<div class="expense-card"><b>${esc(e.supplier||'Dépense')}</b><p>${esc(e.jobName||'Aucun chantier')} • ${esc(e.category)} • ${fmtMoney(e.amount)}</p><p class="muted">${fmtDate(e.date)}</p>${e.photo?`<img class="expense-photo" src="${e.photo}" alt="Facture"/>`:''}<button class="darkBtn" onclick="deleteExpense('${e.id}')">Supprimer</button></div>`).join('')||'<div class="expense-card">Aucune dépense.</div>';}
$('addExpenseBtn').onclick=()=>{const file=$('expensePhoto').files[0]; const add=(photo='')=>{state.expenses.push({id:crypto.randomUUID(),jobName:$('expenseJob').value,supplier:$('expenseSupplier').value,amount:$('expenseAmount').value,category:$('expenseCategory').value,date:todayISO(),photo}); ['expenseSupplier','expenseAmount','expensePhoto'].forEach(id=>$(id).value=''); save(); render();}; if(file){const r=new FileReader(); r.onload=()=>add(r.result); r.readAsDataURL(file)}else add();};
window.deleteExpense=(id)=>{state.expenses=state.expenses.filter(e=>e.id!==id);save();render()}
function renderPunches(){const list=$('punchList'); list.innerHTML=(state.activePunch?`<div class="punch-card"><b>Punch actif</b><p>${state.activePunch.jobName||'Aucun chantier'} depuis ${new Date(state.activePunch.start).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'})}</p></div>`:'')+state.punches.slice().reverse().map(p=>`<div class="punch-card"><b>${esc(p.jobName||'Aucun chantier')}</b><p>${new Date(p.start).toLocaleString('fr-CA')} → ${new Date(p.end).toLocaleString('fr-CA')}</p></div>`).join('');}
$('punchInBtn').onclick=()=>{state.activePunch={jobName:$('punchJob').value,start:new Date().toISOString()};save();render();};
$('punchOutBtn').onclick=()=>{if(!state.activePunch){alert('Aucun punch actif.');return}state.punches.push({...state.activePunch,end:new Date().toISOString(),id:crypto.randomUUID()});state.activePunch=null;save();render();};
function renderCalendar(){const grid=$('calendarGrid'), title=$('calTitle'), agenda=$('agendaList'); if(!grid||!title)return; const y=calDate.getFullYear(), m=calDate.getMonth(); title.textContent=calDate.toLocaleDateString('fr-CA',{month:'long',year:'numeric'}).toUpperCase();
 grid.innerHTML=''; ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach(d=>grid.innerHTML+=`<div class="day-name">${d}</div>`);
 let start=new Date(y,m,1); let offset=(start.getDay()+6)%7; start.setDate(start.getDate()-offset); let days=view==='month'?42:(view==='week'?7:1); if(view==='week'){start=new Date(calDate); start.setDate(start.getDate()-((start.getDay()+6)%7));} if(view==='day'){start=new Date(calDate)}
 for(let i=0;i<days;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=d.toISOString().slice(0,10);const evs=state.events.filter(e=>e.date===iso).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99')); grid.innerHTML+=`<div class="cal-day ${d.getMonth()!==m?'other':''} ${iso===todayISO()?'today':''}" onclick="openDay('${iso}')"><div class="date-num">${d.getDate()}</div>${evs.slice(0,3).map(e=>`<span class="dot ${e.type}" style="background:${esc(jobColor(e.jobName))}">${esc(e.title)}</span>`).join('')}</div>`;}
 let upcoming=state.events.filter(e=>e.date>=todayISO()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,25); agenda.innerHTML=upcoming.map(eventCard).join('')||'<div class="event-card">Aucun événement à venir.</div>';
}
function eventCard(e){return `<div class="event-card" style="border-left:8px solid ${esc(jobColor(e.jobName))}" onclick="editEvent('${e.id}')"><div class="event-row"><b>${esc(e.title)}</b><span class="mini" style="background:${esc(jobColor(e.jobName))}">${esc(e.type)}</span></div><p>${fmtDate(e.date)} ${e.time?('• '+e.time):''}</p><p class="muted">${esc(e.jobName||'')} ${e.notes?'• '+esc(e.notes):''}</p></div>`}
$('prevMonth').onclick=()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()}; $('nextMonth').onclick=()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()};
document.querySelectorAll('.viewBtn').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('.viewBtn').forEach(x=>x.classList.toggle('active',x===b));renderCalendar();});
$('newEventBtn').onclick=()=>openEvent(); window.openDay=openDay; window.editEvent=(id)=>openEvent(state.events.find(e=>e.id===id));

function openDay(iso){
 selectedDay=iso;
 calDate=new Date(iso+'T12:00:00');
 const list=$('dayEventsList');
 $('dayTitle').textContent=fmtDate(iso).toUpperCase();
 const evs=state.events.filter(e=>e.date===iso).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99'));
 list.innerHTML=evs.length?evs.map(eventCard).join(''):'<div class="event-card"><b>Aucun événement cette journée.</b><p class="muted">Utilise le bouton ci-dessous pour ajouter un chantier, rappel ou appel.</p></div>';
 $('dayDialog').showModal();
}
$('closeDayBtn').onclick=()=>$('dayDialog').close();
$('addEventForDayBtn').onclick=()=>{ const iso=selectedDay||todayISO(); $('dayDialog').close(); openEvent({date:iso}); };

function openEvent(e={}){editingEventId=e.id||null; renderSelects(); $('eventTitle').value=e.title||''; $('eventDate').value=e.date||todayISO(); $('eventTime').value=e.time||''; $('eventType').value=e.type||'Chantier'; $('eventJob').value=e.jobName||''; $('eventNotes').value=e.notes||''; $('deleteEventBtn').style.display=editingEventId?'block':'none'; $('eventDialog').showModal();}
$('fillFromJobBtn').onclick=()=>{const j=getJob($('eventJob').value); if(!j){alert('Choisis un chantier dans la liste.');return} if(!$('eventTitle').value.trim()) $('eventTitle').value=j.name+' — chantier'; if(!$('eventNotes').value.trim()) $('eventNotes').value=[j.address,j.notes].filter(Boolean).join(' • '); $('eventType').value='Chantier';};
$('closeEventBtn').onclick=()=>$('eventDialog').close(); $('saveEventBtn').onclick=(ev)=>{ev.preventDefault(); const obj={id:editingEventId||crypto.randomUUID(),title:$('eventTitle').value.trim()||'Sans titre',date:$('eventDate').value,time:$('eventTime').value,type:$('eventType').value,jobName:$('eventJob').value,notes:$('eventNotes').value}; if(editingEventId){state.events=state.events.map(e=>e.id===editingEventId?obj:e)}else state.events.push(obj); save(); $('eventDialog').close(); render();};
$('deleteEventBtn').onclick=()=>{if(editingEventId&&confirm('Supprimer cet événement?')){state.events=state.events.filter(e=>e.id!==editingEventId);save();$('eventDialog').close();render();}}
function esc(s){return String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
render();

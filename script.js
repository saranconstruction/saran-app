const KEY='saranAppV4';
const $=id=>document.getElementById(id);
const todayISO=()=>new Date().toISOString().slice(0,10);
let state=load(); let currentMonth=new Date(); let editingJobId=null; let selectedDate=todayISO(); let timerInt=null;
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)); if(s&&s.jobs)return s;}catch(e){} return {jobs:[],events:[],tasks:[],punches:[],expenses:[],activePunch:null,user:'jesse'};}
function save(){localStorage.setItem(KEY,JSON.stringify(state)); renderAll();}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function fmtDT(ts){return new Date(ts).toLocaleString('fr-CA',{dateStyle:'short',timeStyle:'short'})}
function minutesBetween(a,b){return Math.round((new Date(b)-new Date(a))/60000)}
function paidMinutes(start,end){const m=minutesBetween(start,end); return Math.max(0,m-(m>=300?30:0));}
function h(min){return (min/60).toFixed(2)+' h'}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button,.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active');renderAll();});
$('userSelect').onchange=e=>{state.user=e.target.value;save()};
function applyRole(){const admin=state.user==='jesse';$('roleLabel').textContent=admin?'Mode Admin':'Mode Employé';$('userSelect').value=state.user;document.querySelectorAll('.adminOnly').forEach(el=>el.style.display=admin?'':'none');}

function renderSelects(){const selects=['multiJob','punchJob','expenseJob']; selects.forEach(id=>{const el=$(id); if(!el)return; const val=el.value; el.innerHTML='<option value="">Choisir chantier</option>'+state.jobs.map(j=>`<option value="${j.id}">${j.name}</option>`).join(''); el.value=val;});}
function jobById(id){return state.jobs.find(j=>j.id===id)}

$('saveJob').onclick=()=>{const name=$('jobName').value.trim(); if(!name)return alert('Nom du chantier obligatoire'); const data={name,address:$('jobAddress').value.trim(),phone:$('jobPhone').value.trim(),notes:$('jobNotes').value.trim(),color:$('jobColor').value}; if(editingJobId){Object.assign(jobById(editingJobId),data);}else{state.jobs.push({id:uid(),...data});} clearJob(); save();};
$('clearJobForm').onclick=clearJob; function clearJob(){editingJobId=null;['jobName','jobAddress','jobPhone','jobNotes'].forEach(id=>$(id).value='');$('jobColor').value='#444444'}
function editJob(id){const j=jobById(id); editingJobId=id; $('jobName').value=j.name;$('jobAddress').value=j.address||'';$('jobPhone').value=j.phone||'';$('jobNotes').value=j.notes||'';$('jobColor').value=j.color||'#444444'; document.querySelector('[data-tab="jobs"]').click();}
function deleteJob(id){if(!confirm('Supprimer ce chantier complet, ses événements calendrier, tâches, dépenses et punchs liés?'))return; state.jobs=state.jobs.filter(j=>j.id!==id); state.events=state.events.filter(e=>e.jobId!==id); state.tasks=state.tasks.filter(t=>t.jobId!==id); state.expenses=state.expenses.filter(x=>x.jobId!==id); state.punches=state.punches.filter(p=>p.jobId!==id); save();}
function renderJobs(){const list=$('jobList'); list.innerHTML=state.jobs.map(j=>`<div class="jobRow"><div class="rowTop"><strong><span class="colorDot" style="background:${j.color}"></span> ${j.name}</strong><span>${j.address||''}</span></div><p>${j.notes||''}</p><button onclick="editJob('${j.id}')">Modifier</button> <button class="danger" onclick="deleteJob('${j.id}')">Supprimer chantier complet</button></div>`).join('')||'<div class="card">Aucun chantier.</div>';}

$('prevMonth').onclick=()=>{currentMonth.setMonth(currentMonth.getMonth()-1);renderCalendar()}; $('nextMonth').onclick=()=>{currentMonth.setMonth(currentMonth.getMonth()+1);renderCalendar()};
$('addMulti').onclick=()=>{
  const jobId=$('multiJob').value,start=$('multiStart').value,end=$('multiEnd').value,time=$('multiTime').value||'07:00';
  const includeWeekends=$('includeWeekends') && $('includeWeekends').checked;
  if(!jobId||!start||!end)return alert('Choisis chantier, date début et date fin');
  let d=new Date(start+'T12:00'), last=new Date(end+'T12:00');
  if(d>last)return alert('Date de fin avant date de début');
  const series=uid();
  const j=jobById(jobId);
  let added=0, skipped=0;
  while(d<=last){
    const day=d.getDay(); // 0 dimanche, 6 samedi
    const isWeekend=day===0||day===6;
    if(includeWeekends || !isWeekend){
      const date=d.toISOString().slice(0,10);
      state.events.push({id:uid(),seriesId:series,jobId,date,time,title:j.name,color:j.color});
      added++;
    } else { skipped++; }
    d.setDate(d.getDate()+1);
  }
  save();
  alert(`${added} journée(s) ajoutée(s). ${skipped} samedi/dimanche ignoré(s).`);
};
function renderCalendar(){renderSelects(); $('monthLabel').textContent=currentMonth.toLocaleDateString('fr-CA',{month:'long',year:'numeric'}); const grid=$('calendarGrid'); const y=currentMonth.getFullYear(),m=currentMonth.getMonth(); const first=new Date(y,m,1); const start=new Date(first); start.setDate(first.getDate()-((first.getDay()+6)%7)); const names=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']; grid.innerHTML=names.map(n=>`<div class="dayName">${n}</div>`).join(''); for(let i=0;i<42;i++){let d=new Date(start); d.setDate(start.getDate()+i); const iso=d.toISOString().slice(0,10); const evs=state.events.filter(e=>e.date===iso); const loose=state.tasks.filter(t=>t.date===iso && !t.eventId); grid.innerHTML+=`<div class="day ${d.getMonth()!==m?'out':''}" onclick="openDay('${iso}')"><div class="dateNum">${d.getDate()}</div>${evs.slice(0,3).map(e=>`<div class="eventPill" style="background:${e.color||'#333'}">${e.title}</div>`).join('')}${loose.length?`<div class="eventPill taskPill">${loose.length} tâche(s)</div>`:''}</div>`;} }
function openDay(iso){
  selectedDate=iso;
  const evs=state.events.filter(e=>e.date===iso);
  const looseTasks=state.tasks.filter(t=>t.date===iso && !t.eventId);
  const panel=$('dayPanel');
  panel.classList.remove('hidden');
  panel.innerHTML=`<h3>${iso}</h3>
    <div class="adminOnly quickTaskBox">
      <h4>Ajouter une tâche / journée simple</h4>
      <label>Chantier</label>
      <select id="taskJob"><option value="">Aucun chantier / tâche générale</option>${state.jobs.map(j=>`<option value="${j.id}">${j.name}</option>`).join('')}</select>
      <input id="taskTitle" placeholder="Ex: commander matériaux, appeler client, finition PVC">
      <input id="taskTime" type="time" value="07:00">
      <button type="button" id="addDayTaskBtn">Ajouter tâche</button>
    </div>
    ${evs.map(e=>eventHtml(e)).join('')||'<p>Rien cette date.</p>'}
    ${looseTasks.length?`<div class="jobRow"><strong>Tâches générales</strong>${looseTasks.map(t=>taskHtml(t)).join('')}</div>`:''}`;
  applyRole();
  const btn=$('addDayTaskBtn');
  if(btn) btn.onclick=addTaskToDay;
}
function taskHtml(t){return `<div class="taskRow ${t.done?'done':''}" onclick="toggleTask('${t.id}')">${t.done?'☑':'☐'} ${t.title}</div>`}
function eventHtml(e){
  const j=jobById(e.jobId)||{};
  const tasks=state.tasks.filter(t=>t.eventId===e.id);
  return `<div class="jobRow"><strong style="color:${e.color||'#333'}">${e.title}</strong><p>${j.address||''} ${e.time||''}</p>${tasks.map(t=>taskHtml(t)).join('')}<button onclick="deleteEvent('${e.id}')">Supprimer cette journée</button> <button class="danger" onclick="deleteSeries('${e.seriesId||e.id}')">Supprimer toute la série</button></div>`
}
function addTaskToDay(){
  const jobId=$('taskJob') ? $('taskJob').value : '';
  const title=$('taskTitle') ? $('taskTitle').value.trim() : '';
  const time=$('taskTime') ? $('taskTime').value : '07:00';
  if(!title)return alert('Écris la tâche à ajouter');
  let eventId=null;
  if(jobId){
    const j=jobById(jobId);
    let ev=state.events.find(e=>e.date===selectedDate && e.jobId===jobId && !e.seriesId);
    if(!ev){
      ev={id:uid(),seriesId:null,jobId,date:selectedDate,time,title:j.name,color:j.color};
      state.events.push(ev);
    }
    eventId=ev.id;
  }
  state.tasks.push({id:uid(),eventId,jobId,date:selectedDate,title,done:false});
  save();
  openDay(selectedDate);
}
function toggleTask(id){const t=state.tasks.find(x=>x.id===id); if(!t)return; t.done=!t.done; save(); openDay(selectedDate);}
function deleteEvent(id){state.events=state.events.filter(e=>e.id!==id); state.tasks=state.tasks.filter(t=>t.eventId!==id); save(); openDay(selectedDate);}
function deleteSeries(seriesId){if(!confirm('Supprimer toutes les dates de cette série?'))return; const ids=state.events.filter(e=>(e.seriesId||e.id)===seriesId).map(e=>e.id); state.events=state.events.filter(e=>(e.seriesId||e.id)!==seriesId); state.tasks=state.tasks.filter(t=>!ids.includes(t.eventId)); save(); openDay(selectedDate);}

$('punchIn').onclick=()=>{const employee=$('punchEmployee').value,jobId=$('punchJob').value;if(!jobId)return alert('Choisis un chantier'); if(state.activePunch)return alert('Punch déjà actif'); state.activePunch={employee,jobId,start:new Date().toISOString()}; save();};
$('punchOut').onclick=()=>{if(!state.activePunch)return alert('Aucun punch actif'); const p={id:uid(),...state.activePunch,end:new Date().toISOString()}; state.punches.push(p); state.activePunch=null; save();};
function renderPunch(){renderSelects(); if(timerInt)clearInterval(timerInt); const t=$('timer'); if(state.activePunch){const upd=()=>{const j=jobById(state.activePunch.jobId)||{}; const m=minutesBetween(state.activePunch.start,new Date().toISOString()); t.textContent=`${state.activePunch.employee} — ${j.name} — ${h(m)}`}; upd(); timerInt=setInterval(upd,1000);}else t.textContent='Aucun punch actif'; $('punchHistory').innerHTML=state.punches.slice().reverse().map(p=>{const j=jobById(p.jobId)||{};return `<div class="punchRow"><strong>${p.employee}</strong> — ${j.name||''}<br>${fmtDT(p.start)} à ${fmtDT(p.end)}<br>Payé: ${h(paidMinutes(p.start,p.end))} (dîner -30 min si 5h+)</div>`}).join('');}

$('saveExpense').onclick=()=>{const jobId=$('expenseJob').value,supplier=$('expenseSupplier').value.trim(),amount=parseFloat($('expenseAmount').value||0),desc=$('expenseDesc').value.trim(); if(!jobId||!supplier||!amount)return alert('Chantier, fournisseur et montant obligatoires'); const file=$('expensePhoto').files[0]; const done=photo=>{state.expenses.push({id:uid(),date:todayISO(),jobId,supplier,amount,desc,photo}); ['expenseSupplier','expenseAmount','expenseDesc'].forEach(id=>$(id).value='');$('expensePhoto').value=''; save();}; if(file){const r=new FileReader(); r.onload=()=>done(r.result); r.readAsDataURL(file);}else done(null);};
function renderExpenses(){renderSelects(); $('expenseList').innerHTML=state.expenses.slice().reverse().map(e=>{const j=jobById(e.jobId)||{}; return `<div class="expenseRow"><strong>${e.supplier}</strong> — ${j.name||''}<br>${e.amount.toFixed(2)} $ — ${e.desc||''}<br>${e.photo?`<img src="${e.photo}" class="photoThumb">`:''}</div>`}).join('')||'<div class="card">Aucune dépense.</div>';}
function renderPayroll(){const by={}; state.punches.forEach(p=>{by[p.employee]=(by[p.employee]||0)+paidMinutes(p.start,p.end)}); $('payrollList').innerHTML=Object.entries(by).map(([emp,min])=>`<div class="card"><strong>${emp}</strong><br>Total payé: ${h(min)}</div>`).join('')||'<div class="card">Aucune heure.</div>';}
$('exportPayroll').onclick=()=>{let csv='Employe,Chantier,Debut,Fin,Minutes payees\n'+state.punches.map(p=>`${p.employee},${(jobById(p.jobId)||{}).name||''},${p.start},${p.end},${paidMinutes(p.start,p.end)}`).join('\n'); download('paye.csv',csv,'text/csv')}
$('exportData').onclick=()=>download('saran-backup.json',JSON.stringify(state,null,2),'application/json'); $('importData').onchange=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{state=JSON.parse(r.result); save();}; r.readAsText(f);}; function download(name,txt,type){const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type})); a.download=name; a.click();}
function renderToday(){const iso=todayISO(); const evs=state.events.filter(e=>e.date===iso); $('todayList').innerHTML=evs.map(e=>eventHtml(e)).join('')||'<div class="card">Rien au calendrier aujourd’hui.</div>';}
function renderAll(){applyRole(); renderSelects(); renderJobs(); renderCalendar(); renderPunch(); renderExpenses(); renderPayroll(); renderToday();}
renderAll();

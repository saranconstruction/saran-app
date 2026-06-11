const storeKey = 'saranAppV2';
let data = JSON.parse(localStorage.getItem(storeKey) || 'null') || {
  jobs:[
    {id:crypto.randomUUID(), name:'Virginie', address:'', phone:'', note:'PVC SJC + pieux'},
    {id:crypto.randomUUID(), name:'Guy Bergeron', address:"248 d’Allier", phone:'', note:'Pieux lundi'},
    {id:crypto.randomUUID(), name:'Cécile Vette', address:'', phone:'', note:'Reposer le Vénus'}
  ],
  tasks:[], punches:[], expenses:[]
};
if(data.tasks.length===0){
 const v=data.jobs.find(j=>j.name==='Virginie')?.id, g=data.jobs.find(j=>j.name==='Guy Bergeron')?.id, c=data.jobs.find(j=>j.name==='Cécile Vette')?.id;
 data.tasks=[
  {id:crypto.randomUUID(), title:'Planter les pieux', date:'2026-06-12', jobId:v, employee:'', note:'Horaire à confirmer'},
  {id:crypto.randomUUID(), title:'Reposer le Vénus', date:'2026-06-12', jobId:c, employee:'', note:'Horaire à confirmer'},
  {id:crypto.randomUUID(), title:'Pieux au 248 d’Allier', date:'2026-06-15', jobId:g, employee:'', note:''}
 ]; save();
}
function save(){localStorage.setItem(storeKey, JSON.stringify(data));}
function jobName(id){return data.jobs.find(j=>j.id===id)?.name || 'Sans chantier'}
function fmtDate(d){ if(!d) return ''; const dt=new Date(d+'T12:00:00'); return dt.toLocaleDateString('fr-CA',{weekday:'long', day:'numeric', month:'long'}); }
function money(n){return Number(n||0).toLocaleString('fr-CA',{style:'currency',currency:'CAD'});}

document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button,.page').forEach(x=>x.classList.remove('active')); b.classList.add('active'); document.getElementById(b.dataset.tab).classList.add('active'); render();});
function optionLists(){['taskJob','punchJob','expenseJob'].forEach(id=>{const s=document.getElementById(id); s.innerHTML='<option value="">Choisir chantier</option>'+data.jobs.map(j=>`<option value="${j.id}">${j.name}</option>`).join('');});}
function render(){optionLists(); renderTasks(); renderJobs(); renderPunches(); renderExpenses();}
function renderTasks(){const sorted=[...data.tasks].sort((a,b)=>(a.date||'').localeCompare(b.date||'')); const html=sorted.map(t=>`<div class="item"><h3>${t.title}</h3><div class="muted">${fmtDate(t.date)} • ${jobName(t.jobId)} ${t.employee?'• '+t.employee:''}</div>${t.note?`<p>${t.note}</p>`:''}<div class="actions"><button onclick="doneTask('${t.id}')">Terminé</button><button class="danger" onclick="delTask('${t.id}')">Supprimer</button></div></div>`).join('')||'<div class="item">Aucune tâche.</div>'; document.getElementById('calendarList').innerHTML=html; document.getElementById('todayList').innerHTML=html;}
function addTask(){const t={id:crypto.randomUUID(), title:taskTitle.value.trim(), date:taskDate.value, jobId:taskJob.value, employee:taskEmployee.value.trim(), note:taskNote.value.trim()}; if(!t.title) return alert('Ajoute un titre.'); data.tasks.push(t); save(); taskTitle.value=taskDate.value=taskEmployee.value=taskNote.value=''; render();}
function openQuickTask(){document.querySelector('[data-tab="calendar"]').click(); taskTitle.focus();}
function doneTask(id){data.tasks=data.tasks.filter(t=>t.id!==id); save(); render();}
function delTask(id){if(confirm('Supprimer cette tâche?')) doneTask(id);}
function renderJobs(){document.getElementById('jobsList').innerHTML=data.jobs.map(j=>{const expenses=data.expenses.filter(e=>e.jobId===j.id); const total=expenses.reduce((s,e)=>s+Number(e.amount||0),0); return `<div class="item"><h3>${j.name}</h3><div class="muted">${j.address||'Adresse à ajouter'} ${j.phone?'• '+j.phone:''}</div>${j.note?`<p>${j.note}</p>`:''}<div class="total">Dépenses: ${money(total)}</div><span class="badge">${data.tasks.filter(t=>t.jobId===j.id).length} tâches</span><span class="badge">${expenses.length} factures</span><div class="actions"><button class="danger" onclick="delJob('${j.id}')">Supprimer</button></div></div>`}).join('');}
function addJob(){const j={id:crypto.randomUUID(), name:jobName.value.trim(), address:jobAddress.value.trim(), phone:jobPhone.value.trim(), note:jobNote.value.trim()}; if(!j.name) return alert('Nom du chantier/client requis.'); data.jobs.push(j); save(); jobName.value=jobAddress.value=jobPhone.value=jobNote.value=''; render();}
function delJob(id){if(!confirm('Supprimer ce chantier?'))return; data.jobs=data.jobs.filter(j=>j.id!==id); save(); render();}
function punchIn(){const jobId=punchJob.value, employee=punchEmployee.value.trim()||'Employé'; if(!jobId) return alert('Choisis un chantier.'); data.punches.push({id:crypto.randomUUID(),jobId,employee,start:new Date().toISOString(),end:null}); save(); render();}
function punchOut(){const employee=punchEmployee.value.trim()||'Employé'; const p=[...data.punches].reverse().find(x=>x.employee===employee&&!x.end); if(!p) return alert('Aucun punch IN ouvert pour cet employé.'); p.end=new Date().toISOString(); save(); render();}
function renderPunches(){document.getElementById('punchList').innerHTML=[...data.punches].reverse().map(p=>`<div class="item"><h3>${p.employee}</h3><div class="muted">${jobName(p.jobId)}</div><p>Début: ${new Date(p.start).toLocaleString('fr-CA')}</p><p>Fin: ${p.end?new Date(p.end).toLocaleString('fr-CA'):'En cours'}</p></div>`).join('')||'<div class="item">Aucun punch.</div>';}
function addExpense(){const file=expensePhoto.files[0]; if(!expenseJob.value) return alert('Choisis un chantier.'); if(!expenseAmount.value) return alert('Ajoute un montant.'); const finish=(photo)=>{data.expenses.push({id:crypto.randomUUID(),jobId:expenseJob.value,supplier:expenseSupplier.value.trim(),amount:expenseAmount.value,category:expenseCategory.value,note:expenseNote.value.trim(),photo,date:new Date().toISOString()}); save(); expenseSupplier.value=expenseAmount.value=expenseNote.value=''; expensePhoto.value=''; render();}; if(file){const reader=new FileReader(); reader.onload=e=>finish(e.target.result); reader.readAsDataURL(file);} else finish(null);}
function renderExpenses(){const total=data.expenses.reduce((s,e)=>s+Number(e.amount||0),0); document.getElementById('expenseList').innerHTML=`<div class="total">Total: ${money(total)}</div>`+[...data.expenses].reverse().map(e=>`<div class="item"><h3>${money(e.amount)} • ${e.supplier||'Fournisseur'}</h3><div class="muted">${jobName(e.jobId)} • ${e.category} • ${new Date(e.date).toLocaleDateString('fr-CA')}</div>${e.note?`<p>${e.note}</p>`:''}${e.photo?`<img class="thumb" src="${e.photo}" alt="Facture">`:''}<div class="actions"><button class="danger" onclick="delExpense('${e.id}')">Supprimer</button></div></div>`).join('');}
function delExpense(id){if(confirm('Supprimer cette dépense?')){data.expenses=data.expenses.filter(e=>e.id!==id); save(); render();}}
render();

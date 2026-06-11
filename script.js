function showPage(id){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');}
function punch(type){const c=document.getElementById('chantierSelect').value;const now=new Date().toLocaleString('fr-CA');document.getElementById('punchLog').textContent=`${type==='in'?'Punch in':'Punch out'} — ${c} — ${now}`;}
function saveExpense(){const f=document.getElementById('fournisseur').value||'Fournisseur';const m=document.getElementById('montant').value||'0';const c=document.getElementById('depenseChantier').value;document.getElementById('expenseLog').textContent=`Dépense enregistrée: ${f} — ${m}$ — ${c}`;}
function addTask(){alert('Prochaine version: formulaire pour ajouter une tâche au calendrier.');}

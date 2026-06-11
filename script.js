const $ = id => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDT = ts => ts ? new Date(ts).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) : '';
const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
const paidMinutes = (start, end) => {
  const m = minutesBetween(start, end);
  return Math.max(0, m - (m >= 300 ? 30 : 0));
};
const h = min => (min / 60).toFixed(2) + ' h';

let supabaseClient = null;
let currentProfile = null;
let currentUser = null;
let currentMonth = new Date();
let editingJobId = null;
let selectedDate = todayISO();
let timerInt = null;

let state = {
  jobs: [],
  events: [],
  tasks: [],
  punches: [],
  expenses: [],
  activePunch: null,
  user: 'karl'
};

function cleanSupabaseUrl(url) {
  return (url || '').replace('/rest/v1/', '').replace(/\/$/, '');
}

async function initSupabase() {
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json());
  const url = cleanSupabaseUrl(cfg.supabaseUrl);
  const key = cfg.supabaseKey;
  if (!url || !key) throw new Error('Config Supabase manquante');
  supabaseClient = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

function showLogin(message = '') {
  $('loginScreen').classList.remove('hidden');
  $('appMain').classList.add('hidden');
  if ($('loginError')) $('loginError').textContent = message;
}

function showApp() {
  $('loginScreen').classList.add('hidden');
  if ($('passwordScreen')) $('passwordScreen').classList.add('hidden');
  $('appMain').classList.remove('hidden');
}

function showPasswordScreen(message = '') {
  $('loginScreen').classList.add('hidden');
  $('appMain').classList.add('hidden');
  if ($('passwordScreen')) $('passwordScreen').classList.remove('hidden');
  if ($('passwordError')) $('passwordError').textContent = message;
}

function recoveryModeRequested() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  return hash.includes('type=recovery') || search.includes('type=recovery') || hash.includes('access_token=');
}

async function forgotPassword() {
  const email = $('loginEmail').value.trim();
  $('loginError').textContent = '';
  if (!email) {
    $('loginError').textContent = 'Entre ton courriel avant de cliquer mot de passe oublié.';
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) {
    $('loginError').textContent = error.message;
    return;
  }
  $('loginError').textContent = 'Courriel envoyé. Ouvre le lien reçu pour changer ton mot de passe.';
}

async function updatePassword() {
  const p1 = $('newPassword').value;
  const p2 = $('newPassword2').value;
  $('passwordError').textContent = '';
  if (!p1 || p1.length < 6) {
    $('passwordError').textContent = 'Mot de passe trop court. Minimum 6 caractères.';
    return;
  }
  if (p1 !== p2) {
    $('passwordError').textContent = 'Les deux mots de passe ne sont pas identiques.';
    return;
  }
  const { error } = await supabaseClient.auth.updateUser({ password: p1 });
  if (error) {
    $('passwordError').textContent = error.message;
    return;
  }
  history.replaceState(null, '', window.location.origin);
  const { data: { session } } = await supabaseClient.auth.getSession();
  await openSession(session);
}

async function signIn() {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  $('loginError').textContent = '';
  if (!email || !password) {
    $('loginError').textContent = 'Entre ton courriel et ton mot de passe.';
    return;
  }
  $('loginBtn').disabled = true;
  $('loginBtn').textContent = 'Connexion...';
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  $('loginBtn').disabled = false;
  $('loginBtn').textContent = 'Se connecter';
  if (error) {
    $('loginError').textContent = error.message;
    return;
  }
  await openSession(data.session);
}

async function logout() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentProfile = null;
  currentUser = null;
  showLogin();
}

async function openSession(session) {
  if (!session || !session.user) {
    showLogin();
    return;
  }
  currentUser = session.user;

  let profile = null;
  let byId = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (byId.data) {
    profile = byId.data;
  } else {
    let byEmail = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('email', currentUser.email)
      .maybeSingle();

    if (byEmail.data) profile = byEmail.data;
  }

  if (!profile) {
    profile = {
      id: currentUser.id,
      email: currentUser.email,
      full_name: currentUser.email,
      role: 'employee'
    };
  }

  currentProfile = profile;
  state.user = currentProfile.role === 'admin' ? 'jesse' : 'karl';

  if ($('connectedUser')) {
    $('connectedUser').textContent = `${currentProfile.full_name || currentUser.email} — ${currentProfile.role}`;
  }

  showApp();
  await loadAllFromSupabase();
}

async function loadAllFromSupabase() {
  const [jobsRes, eventsRes, tasksRes, punchesRes, expensesRes] = await Promise.all([
    supabaseClient.from('jobs').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('events').select('*').order('event_date', { ascending: true }),
    supabaseClient.from('tasks').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('time_entries').select('*').order('punch_in', { ascending: true }),
    supabaseClient.from('expenses').select('*').order('created_at', { ascending: true })
  ]);

  if (jobsRes.error) return alert('Erreur jobs: ' + jobsRes.error.message);
  if (eventsRes.error) return alert('Erreur calendrier: ' + eventsRes.error.message);
  if (tasksRes.error) return alert('Erreur tâches: ' + tasksRes.error.message);
  if (punchesRes.error) return alert('Erreur punch: ' + punchesRes.error.message);
  if (expensesRes.error) return alert('Erreur dépenses: ' + expensesRes.error.message);

  state.jobs = (jobsRes.data || []).map(j => ({
    id: j.id,
    name: j.name,
    address: j.address || '',
    phone: j.phone || '',
    notes: j.notes || '',
    color: j.color || '#444444'
  }));

  state.events = (eventsRes.data || []).map(e => ({
    id: e.id,
    seriesId: e.series_id,
    jobId: e.job_id,
    date: e.event_date,
    time: e.start_time || '07:00',
    title: e.title,
    notes: e.notes || '',
    color: e.color || '#333333'
  }));

  state.tasks = (tasksRes.data || []).map(t => ({
    id: t.id,
    eventId: t.event_id,
    jobId: t.job_id,
    date: t.task_date,
    title: t.title,
    done: !!t.done
  }));

  state.punches = (punchesRes.data || []).filter(p => p.punch_out).map(p => ({
    id: p.id,
    employee: p.note || 'Employé',
    jobId: p.job_id,
    start: p.punch_in,
    end: p.punch_out,
    paid_minutes: p.paid_minutes
  }));

  const active = (punchesRes.data || []).find(p => p.user_id === currentUser.id && !p.punch_out);
  state.activePunch = active ? {
    id: active.id,
    employee: currentProfile.full_name || 'Employé',
    jobId: active.job_id,
    start: active.punch_in
  } : null;

  state.expenses = (expensesRes.data || []).map(e => ({
    id: e.id,
    date: e.expense_date,
    jobId: e.job_id,
    supplier: e.supplier || '',
    amount: Number(e.amount || 0),
    desc: e.description || '',
    photo: e.receipt_data || ''
  }));

  renderAll();
}

function isAdmin() {
  return currentProfile && currentProfile.role === 'admin';
}

function applyRole() {
  const admin = isAdmin();
  $('roleLabel').textContent = admin ? 'Mode Admin' : 'Mode Employé';
  document.querySelectorAll('.adminOnly').forEach(el => el.style.display = admin ? '' : 'none');
}

function renderSelects() {
  const selects = ['multiJob', 'punchJob', 'expenseJob'];
  selects.forEach(id => {
    const el = $(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = '<option value="">Choisir chantier</option>' + state.jobs.map(j => `<option value="${j.id}">${j.name}</option>`).join('');
    el.value = val;
  });
}

function jobById(id) {
  return state.jobs.find(j => j.id === id);
}

async function saveJob() {
  if (!isAdmin()) return alert('Accès admin requis.');
  const name = $('jobName').value.trim();
  if (!name) return alert('Nom du chantier obligatoire');
  const data = {
    name,
    address: $('jobAddress').value.trim(),
    phone: $('jobPhone').value.trim(),
    notes: $('jobNotes').value.trim(),
    color: $('jobColor').value || '#444444',
    created_by: currentUser.id
  };

  if (editingJobId) {
    const { error } = await supabaseClient.from('jobs').update(data).eq('id', editingJobId);
    if (error) return alert('Erreur modification chantier: ' + error.message);
  } else {
    const { error } = await supabaseClient.from('jobs').insert(data);
    if (error) return alert('Erreur création chantier: ' + error.message);
  }
  clearJob();
  await loadAllFromSupabase();
}

function clearJob() {
  editingJobId = null;
  ['jobName', 'jobAddress', 'jobPhone', 'jobNotes'].forEach(id => $(id).value = '');
  $('jobColor').value = '#444444';
}

function editJob(id) {
  if (!isAdmin()) return alert('Accès admin requis.');
  const j = jobById(id);
  if (!j) return;
  editingJobId = id;
  $('jobName').value = j.name;
  $('jobAddress').value = j.address || '';
  $('jobPhone').value = j.phone || '';
  $('jobNotes').value = j.notes || '';
  $('jobColor').value = j.color || '#444444';
  document.querySelector('[data-tab="jobs"]').click();
}

async function deleteJob(id) {
  if (!isAdmin()) return alert('Accès admin requis.');
  if (!confirm('Supprimer ce chantier complet, ses événements calendrier, tâches, dépenses et punchs liés?')) return;
  const eventIds = state.events.filter(e => e.jobId === id).map(e => e.id);
  await supabaseClient.from('tasks').delete().in('event_id', eventIds.length ? eventIds : ['00000000-0000-0000-0000-000000000000']);
  await supabaseClient.from('tasks').delete().eq('job_id', id);
  await supabaseClient.from('expenses').delete().eq('job_id', id);
  await supabaseClient.from('time_entries').delete().eq('job_id', id);
  await supabaseClient.from('events').delete().eq('job_id', id);
  const { error } = await supabaseClient.from('jobs').delete().eq('id', id);
  if (error) return alert('Erreur suppression: ' + error.message);
  await loadAllFromSupabase();
}

function renderJobs() {
  const list = $('jobList');
  list.innerHTML = state.jobs.map(j => `<div class="jobRow"><div class="rowTop"><strong><span class="colorDot" style="background:${j.color}"></span> ${j.name}</strong><span>${j.address || ''}</span></div><p>${j.notes || ''}</p>${isAdmin() ? `<button onclick="editJob('${j.id}')">Modifier</button> <button class="danger" onclick="deleteJob('${j.id}')">Supprimer chantier complet</button>` : ''}</div>`).join('') || '<div class="card">Aucun chantier.</div>';
}

function renderCalendar() {
  renderSelects();
  $('monthLabel').textContent = currentMonth.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
  const grid = $('calendarGrid');
  const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const names = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  grid.innerHTML = names.map(n => `<div class="dayName">${n}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    let d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const evs = state.events.filter(e => e.date === iso);
    const loose = state.tasks.filter(t => t.date === iso && !t.eventId);
    grid.innerHTML += `<div class="day ${d.getMonth() !== m ? 'out' : ''}" onclick="openDay('${iso}')"><div class="dateNum">${d.getDate()}</div>${evs.slice(0, 3).map(e => `<div class="eventPill" style="background:${e.color || '#333'}">${e.title}</div>`).join('')}${loose.length ? `<div class="eventPill taskPill">${loose.length} tâche(s)</div>` : ''}</div>`;
  }
}

function openDay(iso) {
  selectedDate = iso;
  const evs = state.events.filter(e => e.date === iso);
  const looseTasks = state.tasks.filter(t => t.date === iso && !t.eventId);
  const panel = $('dayPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `<h3>${iso}</h3>
    <div class="quickTaskBox">
      <h4>Ajouter une tâche / journée simple</h4>
      <label>Chantier</label>
      <select id="taskJob"><option value="">Aucun chantier / tâche générale</option>${state.jobs.map(j => `<option value="${j.id}">${j.name}</option>`).join('')}</select>
      <input id="taskTitle" placeholder="Ex: commander matériaux, appeler client, finition PVC">
      <input id="taskTime" type="time" value="07:00">
      <button type="button" id="addDayTaskBtn">Ajouter tâche</button>
    </div>
    ${evs.map(e => eventHtml(e)).join('') || '<p>Rien cette date.</p>'}
    ${looseTasks.length ? `<div class="jobRow"><strong>Tâches générales</strong>${looseTasks.map(t => taskHtml(t)).join('')}</div>` : ''}`;
  applyRole();
  const btn = $('addDayTaskBtn');
  if (btn) btn.onclick = addTaskToDay;
}

function taskHtml(t) {
  return `<div class="taskRow ${t.done ? 'done' : ''}" onclick="toggleTask('${t.id}')">${t.done ? '☑' : '☐'} ${t.title}</div>`;
}

function eventHtml(e) {
  const j = jobById(e.jobId) || {};
  const tasks = state.tasks.filter(t => t.eventId === e.id);
  return `<div class="jobRow"><strong style="color:${e.color || '#333'}">${e.title}</strong><p>${j.address || ''} ${e.time || ''}</p>${tasks.map(t => taskHtml(t)).join('')}${isAdmin() ? `<button onclick="deleteEvent('${e.id}')">Supprimer cette journée</button> <button class="danger" onclick="deleteSeries('${e.seriesId || e.id}')">Supprimer toute la série</button>` : ''}</div>`;
}

async function addTaskToDay() {
  const jobId = $('taskJob') ? $('taskJob').value : '';
  const title = $('taskTitle') ? $('taskTitle').value.trim() : '';
  const time = $('taskTime') ? $('taskTime').value : '07:00';
  if (!title) return alert('Écris la tâche à ajouter');
  let eventId = null;
  if (jobId) {
    const j = jobById(jobId);
    let ev = state.events.find(e => e.date === selectedDate && e.jobId === jobId && !e.seriesId);
    if (!ev) {
      const { data, error } = await supabaseClient.from('events').insert({
        job_id: jobId,
        event_date: selectedDate,
        start_time: time,
        title: j.name,
        color: j.color,
        created_by: currentUser.id
      }).select().single();
      if (error) return alert('Erreur création événement: ' + error.message);
      ev = { id: data.id, jobId, date: selectedDate, time, title: data.title, color: data.color };
    }
    eventId = ev.id;
  }
  const { error } = await supabaseClient.from('tasks').insert({
    event_id: eventId,
    job_id: jobId || null,
    task_date: selectedDate,
    title,
    done: false,
    created_by: currentUser.id
  });
  if (error) return alert('Erreur tâche: ' + error.message);
  await loadAllFromSupabase();
  openDay(selectedDate);
}

async function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const { error } = await supabaseClient.from('tasks').update({ done: !t.done }).eq('id', id);
  if (error) return alert('Erreur tâche: ' + error.message);
  await loadAllFromSupabase();
  openDay(selectedDate);
}

async function deleteEvent(id) {
  if (!isAdmin()) return alert('Accès admin requis.');
  await supabaseClient.from('tasks').delete().eq('event_id', id);
  const { error } = await supabaseClient.from('events').delete().eq('id', id);
  if (error) return alert('Erreur suppression journée: ' + error.message);
  await loadAllFromSupabase();
  openDay(selectedDate);
}

async function deleteSeries(seriesId) {
  if (!isAdmin()) return alert('Accès admin requis.');
  if (!confirm('Supprimer toutes les dates de cette série?')) return;
  const ids = state.events.filter(e => (e.seriesId || e.id) === seriesId).map(e => e.id);
  if (ids.length) await supabaseClient.from('tasks').delete().in('event_id', ids);
  const { error } = await supabaseClient.from('events').delete().eq('series_id', seriesId);
  if (error) return alert('Erreur suppression série: ' + error.message);
  await loadAllFromSupabase();
  openDay(selectedDate);
}

async function addMultiDates() {
  if (!isAdmin()) return alert('Accès admin requis.');
  const jobId = $('multiJob').value, start = $('multiStart').value, end = $('multiEnd').value, time = $('multiTime').value || '07:00';
  const includeWeekends = $('includeWeekends') && $('includeWeekends').checked;
  if (!jobId || !start || !end) return alert('Choisis chantier, date début et date fin');
  let d = new Date(start + 'T12:00'), last = new Date(end + 'T12:00');
  if (d > last) return alert('Date de fin avant date de début');
  const series = uid();
  const j = jobById(jobId);
  const rows = [];
  let skipped = 0;
  while (d <= last) {
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    if (includeWeekends || !isWeekend) {
      rows.push({
        series_id: series,
        job_id: jobId,
        event_date: d.toISOString().slice(0, 10),
        start_time: time,
        title: j.name,
        color: j.color,
        created_by: currentUser.id
      });
    } else skipped++;
    d.setDate(d.getDate() + 1);
  }
  const { error } = await supabaseClient.from('events').insert(rows);
  if (error) return alert('Erreur calendrier: ' + error.message);
  await loadAllFromSupabase();
  alert(`${rows.length} journée(s) ajoutée(s). ${skipped} samedi/dimanche ignoré(s).`);
}

async function punchIn() {
  const jobId = $('punchJob').value;
  if (!jobId) return alert('Choisis un chantier');
  if (state.activePunch) return alert('Punch déjà actif');
  const { error } = await supabaseClient.from('time_entries').insert({
    user_id: currentUser.id,
    job_id: jobId,
    punch_in: new Date().toISOString(),
    note: currentProfile.full_name || currentUser.email
  });
  if (error) return alert('Erreur punch in: ' + error.message);
  await loadAllFromSupabase();
}

async function punchOut() {
  if (!state.activePunch) return alert('Aucun punch actif');
  const end = new Date().toISOString();
  const paid = paidMinutes(state.activePunch.start, end);
  const { error } = await supabaseClient.from('time_entries').update({
    punch_out: end,
    lunch_minutes: paid >= 270 ? 30 : 0,
    paid_minutes: paid
  }).eq('id', state.activePunch.id);
  if (error) return alert('Erreur punch out: ' + error.message);
  await loadAllFromSupabase();
}

function renderPunch() {
  renderSelects();
  if (timerInt) clearInterval(timerInt);
  const t = $('timer');
  if (state.activePunch) {
    const upd = () => {
      const j = jobById(state.activePunch.jobId) || {};
      const m = minutesBetween(state.activePunch.start, new Date().toISOString());
      t.textContent = `${state.activePunch.employee} — ${j.name || ''} — ${h(m)}`;
    };
    upd();
    timerInt = setInterval(upd, 1000);
  } else t.textContent = 'Aucun punch actif';
  $('punchHistory').innerHTML = state.punches.slice().reverse().map(p => {
    const j = jobById(p.jobId) || {};
    return `<div class="punchRow"><strong>${p.employee}</strong> — ${j.name || ''}<br>${fmtDT(p.start)} à ${fmtDT(p.end)}<br>Payé: ${h(p.paid_minutes || paidMinutes(p.start, p.end))} (dîner -30 min si 5h+)</div>`;
  }).join('');
}

async function saveExpense() {
  const jobId = $('expenseJob').value;
  const supplier = $('expenseSupplier').value.trim();
  const amount = parseFloat($('expenseAmount').value || 0);
  const desc = $('expenseDesc').value.trim();
  if (!jobId || !supplier || !amount) return alert('Chantier, fournisseur et montant obligatoires');
  const file = $('expensePhoto').files[0];
  const insertExpense = async photo => {
    const { error } = await supabaseClient.from('expenses').insert({
      user_id: currentUser.id,
      job_id: jobId,
      supplier,
      amount,
      description: desc,
      receipt_data: photo || null,
      expense_date: todayISO()
    });
    if (error) return alert('Erreur dépense: ' + error.message);
    ['expenseSupplier', 'expenseAmount', 'expenseDesc'].forEach(id => $(id).value = '');
    $('expensePhoto').value = '';
    await loadAllFromSupabase();
  };
  if (file) {
    const r = new FileReader();
    r.onload = () => insertExpense(r.result);
    r.readAsDataURL(file);
  } else insertExpense(null);
}

function renderExpenses() {
  renderSelects();
  $('expenseList').innerHTML = state.expenses.slice().reverse().map(e => {
    const j = jobById(e.jobId) || {};
    return `<div class="expenseRow"><strong>${e.supplier}</strong> — ${j.name || ''}<br>${e.amount.toFixed(2)} $ — ${e.desc || ''}<br>${e.photo ? `<img src="${e.photo}" class="photoThumb">` : ''}</div>`;
  }).join('') || '<div class="card">Aucune dépense.</div>';
}

function renderPayroll() {
  const by = {};
  state.punches.forEach(p => { by[p.employee] = (by[p.employee] || 0) + (p.paid_minutes || paidMinutes(p.start, p.end)); });
  $('payrollList').innerHTML = Object.entries(by).map(([emp, min]) => `<div class="card"><strong>${emp}</strong><br>Total payé: ${h(min)}</div>`).join('') || '<div class="card">Aucune heure.</div>';
}

function exportPayroll() {
  let csv = 'Employe,Chantier,Debut,Fin,Minutes payees\n' + state.punches.map(p => `${p.employee},${(jobById(p.jobId) || {}).name || ''},${p.start},${p.end},${p.paid_minutes || paidMinutes(p.start, p.end)}`).join('\n');
  download('paye.csv', csv, 'text/csv');
}

function download(name, txt, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type }));
  a.download = name;
  a.click();
}

function renderToday() {
  const iso = todayISO();
  const evs = state.events.filter(e => e.date === iso);
  $('todayList').innerHTML = evs.map(e => eventHtml(e)).join('') || '<div class="card">Rien au calendrier aujourd’hui.</div>';
}

function renderAll() {
  applyRole();
  renderSelects();
  renderJobs();
  renderCalendar();
  renderPunch();
  renderExpenses();
  renderPayroll();
  renderToday();
}

function setupHandlers() {
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button,.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $(b.dataset.tab).classList.add('active');
    renderAll();
  });
  $('loginBtn').onclick = signIn;
  if ($('forgotPasswordBtn')) $('forgotPasswordBtn').onclick = forgotPassword;
  if ($('updatePasswordBtn')) $('updatePasswordBtn').onclick = updatePassword;
  if ($('logoutBtn')) $('logoutBtn').onclick = logout;
  $('saveJob').onclick = saveJob;
  $('clearJobForm').onclick = clearJob;
  $('prevMonth').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); };
  $('nextMonth').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); };
  $('addMulti').onclick = addMultiDates;
  $('punchIn').onclick = punchIn;
  $('punchOut').onclick = punchOut;
  $('saveExpense').onclick = saveExpense;
  $('exportPayroll').onclick = exportPayroll;
  $('exportData').onclick = () => download('saran-backup.json', JSON.stringify(state, null, 2), 'application/json');
  if ($('importData')) $('importData').onchange = () => alert('Import désactivé en mode Supabase pour éviter d’écraser la base.');
}

async function startApp() {
  setupHandlers();
  try {
    await initSupabase();
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') showPasswordScreen();
    });
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && recoveryModeRequested()) showPasswordScreen();
    else if (session) await openSession(session);
    else showLogin();
  } catch (e) {
    console.error(e);
    showLogin('Erreur Supabase: ' + e.message);
  }
}

startApp();

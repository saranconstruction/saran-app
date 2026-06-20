const $ = id => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDT = ts => ts ? new Date(ts).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) : '';
const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
function lunchMinutesFor(start, end, manual = 'auto') {
  const gross = minutesBetween(start, end);
  if (manual !== 'auto' && manual !== undefined && manual !== null && manual !== '') return Number(manual) || 0;
  return gross >= 330 ? 30 : 0; // 5 h 30 brut = dîner automatique
}
const paidMinutes = (start, end, manual = 'auto') => {
  const m = minutesBetween(start, end);
  return Math.max(0, m - lunchMinutesFor(start, end, manual));
};
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function isoDateLocal(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
function dateOnly(ts) { return isoDateLocal(new Date(ts)); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' }); }
const h = min => (min / 60).toFixed(2) + ' h';

let supabaseClient = null;
let currentProfile = null;
let currentUser = null;
let currentMonth = new Date();
let editingJobId = null;
let selectedDate = todayISO();
let selectedPunchWeek = startOfWeek(new Date());
let timerInt = null;

let state = {
  jobs: [],
  events: [],
  tasks: [],
  punches: [],
  expenses: [],
  profiles: [],
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
  if ($('passwordScreen')) $('passwordScreen').classList.add('hidden');
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
    const displayName = currentProfile.full_name || currentUser.email || '';
    $('connectedUser').textContent = String(displayName).split(' ')[0].split('@')[0];
  }

  showApp();
  await loadAllFromSupabase();
}

async function loadAllFromSupabase() {
  const [jobsRes, eventsRes, tasksRes, punchesRes, expensesRes, profilesRes] = await Promise.all([
    supabaseClient.from('jobs').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('events').select('*').order('event_date', { ascending: true }),
    supabaseClient.from('tasks').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('time_entries').select('*').order('punch_in', { ascending: true }),
    supabaseClient.from('expenses').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('profiles').select('*').order('full_name', { ascending: true })
  ]);

  if (jobsRes.error) return alert('Erreur jobs: ' + jobsRes.error.message);
  if (eventsRes.error) return alert('Erreur calendrier: ' + eventsRes.error.message);
  if (tasksRes.error) return alert('Erreur tâches: ' + tasksRes.error.message);
  if (punchesRes.error) return alert('Erreur punch: ' + punchesRes.error.message);
  if (expensesRes.error) return alert('Erreur dépenses: ' + expensesRes.error.message);
  if (profilesRes.error) console.warn('Erreur profils:', profilesRes.error.message);
  state.profiles = profilesRes.data || [];

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
    done: !!t.done,
    assignedTo: t.assigned_to || null
  }));

  state.punches = (punchesRes.data || []).filter(p => p.punch_out).map(p => ({
    id: p.id,
    employee: p.note || 'Employé',
    jobId: p.job_id,
    start: p.punch_in,
    end: p.punch_out,
    paid_minutes: p.paid_minutes,
    lunch_minutes: p.lunch_minutes || 0,
    userId: p.user_id
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
    photo: e.receipt_data || '',
    userId: e.user_id
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

function goTab(tab) {
  const btn = document.querySelector(`.tabs button[data-tab="${tab}"]`);
  if (btn) btn.click();
}

function renderSelects() {
  const selects = ['multiJob', 'punchJob', 'expenseJob', 'myTaskJob', 'manualPunchJob'];
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
      <textarea id="taskTitle" rows="4" placeholder="Ex:\n1. commander matériaux\n2. appeler client\n3. finition PVC"></textarea>
      <input id="taskTime" type="time" value="07:00">
      <button type="button" id="addDayTaskBtn">Ajouter tâche</button>
    </div>
    ${evs.map(e => eventHtml(e)).join('') || '<p>Rien cette date.</p>'}
    ${looseTasks.length ? `<div class="jobRow"><strong>Tâches générales</strong>${looseTasks.map(t => taskHtml(t)).join('')}</div>` : ''}`;
  applyRole();
  const btn = $('addDayTaskBtn');
  if (btn) btn.onclick = addTaskToDay;
}

function esc(txt) {
  return String(txt || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function taskHtml(t) {
  const title = esc(t.title).replace(/\n/g, '<br>');
  const assignee = state.profiles ? state.profiles.find(p => p.id === t.assignedTo) : null;
  const who = isAdmin() && assignee ? `<small class="assigneeTag">${esc(assignee.full_name || assignee.email)}</small>` : '';
  return `<div class="taskRow ${t.done ? 'done' : ''}" onclick="toggleTask('${t.id}')">${t.done ? '☑' : '☐'} <span>${title}</span>${who}</div>`;
}

function eventHtml(e) {
  const j = jobById(e.jobId) || {};
  const tasks = state.tasks.filter(t => t.eventId === e.id);
  return `<div class="jobRow"><strong style="color:${e.color || '#333'}">${e.title}</strong><p>${j.address || ''} ${e.time || ''}</p>${tasks.map(t => taskHtml(t)).join('')}${isAdmin() ? `<button onclick="deleteEvent('${e.id}')">Supprimer cette journée</button> <button class="danger" onclick="deleteSeries('${e.seriesId || e.id}')">Supprimer toute la série</button>` : ''}</div>`;
}

async function addTaskToDay() {
  const jobId = $('taskJob') ? $('taskJob').value : '';
  const rawTitle = $('taskTitle') ? $('taskTitle').value : '';
  const lines = rawTitle.split('\\n').map(x => x.trim()).filter(Boolean);
  const time = $('taskTime') ? $('taskTime').value : '07:00';
  if (!lines.length) return alert('Écris la tâche à ajouter');

  let eventId = null;
  if (jobId) {
    const j = jobById(jobId);
    let ev = state.events.find(e => e.date === selectedDate && e.jobId === jobId);
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

  const rows = lines.map(title => ({
    event_id: eventId,
    job_id: jobId || null,
    task_date: selectedDate,
    title,
    done: false,
    created_by: currentUser.id,
    assigned_to: null
  }));

  const { error } = await supabaseClient.from('tasks').insert(rows);
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
  const lunch = lunchMinutesFor(state.activePunch.start, end);
  const paid = paidMinutes(state.activePunch.start, end);
  const { error } = await supabaseClient.from('time_entries').update({
    punch_out: end,
    lunch_minutes: lunch,
    paid_minutes: paid
  }).eq('id', state.activePunch.id);
  if (error) return alert('Erreur punch out: ' + error.message);
  await loadAllFromSupabase();
}


function renderEmployeeSelects() {
  const el = $('manualPunchEmployee');
  if (!el) return;
  const profiles = state.profiles && state.profiles.length ? state.profiles : [];
  const current = el.value;
  el.innerHTML = profiles.map(p => `<option value="${p.id}">${esc(p.full_name || p.email || 'Employé')}</option>`).join('');
  if (current) el.value = current;
  if (!el.value && currentUser) el.value = currentUser.id;
}

function getProfileName(id) {
  const p = state.profiles ? state.profiles.find(x => x.id === id) : null;
  return p ? (p.full_name || p.email || 'Employé') : 'Employé';
}

function localDateTimeISO(date, time) {
  // Crée une date locale puis convertit en ISO pour Supabase.
  return new Date(`${date}T${time || '00:00'}:00`).toISOString();
}

async function saveManualPunch() {
  if (!isAdmin()) return alert('Accès admin requis.');

  const userId = $('manualPunchEmployee').value;
  const jobId = $('manualPunchJob').value;
  const date = $('manualPunchDate').value || todayISO();
  const startTime = $('manualPunchStart').value;
  const endTime = $('manualPunchEnd').value;

  if (!userId || !jobId || !date || !startTime || !endTime) {
    return alert('Employé, chantier, date, début et fin obligatoires.');
  }

  const start = localDateTimeISO(date, startTime);
  const end = localDateTimeISO(date, endTime);
  if (new Date(end) <= new Date(start)) return alert('L’heure de fin doit être après l’heure de début.');

  const lunchChoice = $('manualLunchMinutes') ? $('manualLunchMinutes').value : 'auto';
  const lunch = lunchMinutesFor(start, end, lunchChoice);
  const paid = Math.max(0, minutesBetween(start, end) - lunch);
  const employeeName = getProfileName(userId) + ' (modifié admin)';

  const { error } = await supabaseClient.from('time_entries').insert({
    user_id: userId,
    job_id: jobId,
    punch_in: start,
    punch_out: end,
    lunch_minutes: lunch,
    paid_minutes: paid,
    note: employeeName
  });

  if (error) return alert('Erreur ajout punch: ' + error.message);
  await loadAllFromSupabase();
  alert('Punch ajouté/corrigé.');
}

async function deletePunch(id) {
  if (!isAdmin()) return alert('Accès admin requis.');
  if (!confirm('Supprimer cette entrée de temps?')) return;
  const { error } = await supabaseClient.from('time_entries').delete().eq('id', id);
  if (error) return alert('Erreur suppression punch: ' + error.message);
  await loadAllFromSupabase();
}

function editPunch(id) {
  if (!isAdmin()) return alert('Accès admin requis.');
  const p = state.punches.find(x => x.id === id);
  if (!p) return;
  const start = new Date(p.start);
  const end = new Date(p.end);
  if ($('manualPunchEmployee')) {
    const prof = state.profiles.find(pr => (p.employee || '').includes(pr.full_name) || (p.employee || '').includes(pr.email));
    if (prof) $('manualPunchEmployee').value = prof.id;
  }
  if ($('manualPunchJob')) $('manualPunchJob').value = p.jobId;
  if ($('manualPunchDate')) $('manualPunchDate').value = start.toISOString().slice(0,10);
  if ($('manualPunchStart')) $('manualPunchStart').value = start.toTimeString().slice(0,5);
  if ($('manualPunchEnd')) $('manualPunchEnd').value = end.toTimeString().slice(0,5);
  // Supprime l'ancienne ligne seulement après confirmation pour éviter les doublons.
  if (confirm('Charger cette entrée dans le formulaire et supprimer l’ancienne ligne après correction?')) {
    deletePunch(id);
  }
}

function renderPunch() {
  renderSelects();
  renderEmployeeSelects();
  if ($('manualPunchDate') && !$('manualPunchDate').value) $('manualPunchDate').value = todayISO();

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

  renderPunchWeek();

  const weekStart = selectedPunchWeek;
  const weekEnd = addDays(weekStart, 7);
  const punches = state.punches
    .filter(p => new Date(p.start) >= weekStart && new Date(p.start) < weekEnd)
    .sort((a,b) => new Date(a.start) - new Date(b.start));

  $('punchHistory').innerHTML = punches.map(p => punchRowHtml(p)).join('') || '<div class="card">Aucune entrée cette semaine.</div>';
}

function punchRowHtml(p) {
  const j = jobById(p.jobId) || {};
  const gross = minutesBetween(p.start, p.end);
  const lunch = p.lunch_minutes ?? lunchMinutesFor(p.start, p.end);
  const paid = p.paid_minutes || Math.max(0, gross - lunch);
  const adminButtons = isAdmin() ? `<br><button onclick="editPunch('${p.id}')">Modifier</button> <button class="danger" onclick="deletePunch('${p.id}')">Supprimer</button>` : '';
  return `<div class="punchRow"><strong>${esc(p.employee)}</strong> — ${esc(j.name || '')}<br>${fmtDT(p.start)} à ${fmtTime(p.end)}<br>Brut: ${h(gross)} · Dîner: ${h(lunch)} · Payé: <strong>${h(paid)}</strong>${adminButtons}</div>`;
}

function renderPunchWeek() {
  const weekStart = selectedPunchWeek || startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 6);
  if ($('punchWeekLabel')) $('punchWeekLabel').textContent = `${isoDateLocal(weekStart)} au ${isoDateLocal(weekEnd)}`;
  const box = $('punchWeekSummary');
  if (!box) return;

  const weekLimit = addDays(weekStart, 7);
  const punches = state.punches
    .filter(p => new Date(p.start) >= weekStart && new Date(p.start) < weekLimit)
    .sort((a,b) => new Date(a.start) - new Date(b.start));

  if (!punches.length) {
    box.innerHTML = '<div class="card softCard">Aucun punch cette semaine.</div>';
    return;
  }

  const days = {};
  const totalsByEmployee = {};
  punches.forEach(p => {
    const d = dateOnly(p.start);
    if (!days[d]) days[d] = [];
    days[d].push(p);
    const paid = p.paid_minutes || paidMinutes(p.start, p.end);
    totalsByEmployee[p.employee] = (totalsByEmployee[p.employee] || 0) + paid;
  });

  const totals = Object.entries(totalsByEmployee)
    .map(([emp, min]) => `<div class="miniTotal"><span>${esc(emp)}</span><strong>${h(min)}</strong></div>`).join('');

  const dayHtml = Object.entries(days).map(([date, arr]) => {
    const rows = arr.map(p => {
      const j = jobById(p.jobId) || {};
      const paid = p.paid_minutes || paidMinutes(p.start, p.end);
      return `<div class="weekPunchLine"><span>${fmtTime(p.start)}–${fmtTime(p.end)}</span><strong>${esc(j.name || 'Chantier')}</strong><em>${h(paid)}</em></div>`;
    }).join('');
    const total = arr.reduce((sum,p) => sum + (p.paid_minutes || paidMinutes(p.start,p.end)), 0);
    return `<div class="weekDay"><h4>${date} <span>${h(total)}</span></h4>${rows}</div>`;
  }).join('');

  box.innerHTML = `<div class="weekTotals">${totals}</div>${dayHtml}`;
}

function selectedExpenseFile() {
  return ($('expensePhotoCamera') && $('expensePhotoCamera').files[0]) || ($('expensePhotoGallery') && $('expensePhotoGallery').files[0]) || null;
}

function compressImageFile(file, maxSize = 1400, quality = 0.72) {
  return new Promise(resolve => {
    if (!file || !file.type || !file.type.startsWith('image/')) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function saveExpense() {
  const jobId = $('expenseJob').value;
  const supplier = $('expenseSupplier').value.trim();
  const amount = parseFloat($('expenseAmount').value || 0);
  const desc = $('expenseDesc').value.trim();
  if (!jobId || !supplier || !amount) return alert('Chantier, fournisseur et montant obligatoires');
  const file = selectedExpenseFile();
  const photo = file ? await compressImageFile(file) : null;

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
  if ($('expensePhotoCamera')) $('expensePhotoCamera').value = '';
  if ($('expensePhotoGallery')) $('expensePhotoGallery').value = '';
  if ($('expensePhotoName')) $('expensePhotoName').textContent = 'Aucune photo sélectionnée.';
  await loadAllFromSupabase();
}

function renderExpenses() {
  renderSelects();
  const list = isAdmin() ? state.expenses : state.expenses.filter(e => e.userId === currentUser.id);
  $('expenseList').innerHTML = list.slice().reverse().map(e => {
    const j = jobById(e.jobId) || {};
    const who = isAdmin() ? `<small>${esc(getProfileName(e.userId))}</small><br>` : '';
    return `<div class="expenseRow"><strong>${esc(e.supplier)}</strong> — ${esc(j.name || '')}<br>${who}${e.amount.toFixed(2)} $ — ${esc(e.desc || '')}<br>${e.photo ? `<img src="${e.photo}" class="photoThumb">` : ''}</div>`;
  }).join('') || '<div class="card">Aucune dépense.</div>';
}

function renderPayroll() {
  const weekStart = selectedPunchWeek || startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);
  const punches = state.punches.filter(p => new Date(p.start) >= weekStart && new Date(p.start) < weekEnd).sort((a,b) => new Date(a.start) - new Date(b.start));
  const by = {};
  punches.forEach(p => { by[p.employee] = (by[p.employee] || 0) + (p.paid_minutes || paidMinutes(p.start, p.end)); });
  const label = `<div class="card"><strong>Semaine ${isoDateLocal(weekStart)} au ${isoDateLocal(addDays(weekStart,6))}</strong></div>`;
  const totals = Object.entries(by).map(([emp, min]) => `<div class="card"><strong>${esc(emp)}</strong><br>Total payé: ${h(min)}</div>`).join('');
  const details = punches.map(p => punchRowHtml(p)).join('');
  $('payrollList').innerHTML = label + totals + (details ? `<h3>Détail des entrées</h3>${details}` : '') || '<div class="card">Aucune heure.</div>';
}

function exportPayroll() {
  const weekStart = selectedPunchWeek || startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);
  const punches = state.punches.filter(p => new Date(p.start) >= weekStart && new Date(p.start) < weekEnd);
  let csv = 'Employe,Chantier,Debut,Fin,Diner minutes,Minutes payees\n' + punches.map(p => `${p.employee},${(jobById(p.jobId) || {}).name || ''},${p.start},${p.end},${p.lunch_minutes || lunchMinutesFor(p.start,p.end)},${p.paid_minutes || paidMinutes(p.start, p.end)}`).join('\n');
  download('paye.csv', csv, 'text/csv');
}

function download(name, txt, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type }));
  a.download = name;
  a.click();
}


async function saveMyTasks() {
  const assignee = $('myTaskAssignee') ? $('myTaskAssignee').value : (currentUser ? currentUser.id : null);
  const date = $('myTaskDate').value || todayISO();
  const jobId = $('myTaskJob').value || null;
  const raw = $('myTaskText').value || '';
  const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
  if (!lines.length) return alert('Écris au moins une tâche.');

  let eventId = null;
  if (jobId) {
    const j = jobById(jobId);
    let ev = state.events.find(e => e.date === date && e.jobId === jobId);
    if (!ev) {
      const { data, error } = await supabaseClient.from('events').insert({
        job_id: jobId,
        event_date: date,
        start_time: '07:00',
        title: j ? j.name : 'Tâches',
        color: j ? j.color : '#333333',
        created_by: currentUser.id
      }).select().single();
      if (error) return alert('Erreur création événement: ' + error.message);
      ev = { id: data.id, jobId, date, title: data.title, color: data.color };
    }
    eventId = ev.id;
  }

  const rows = lines.map(title => ({
    event_id: eventId,
    job_id: jobId,
    task_date: date,
    title,
    done: false,
    created_by: currentUser.id,
    assigned_to: assignee || null
  }));

  const { error } = await supabaseClient.from('tasks').insert(rows);
  if (error) return alert('Erreur tâches: ' + error.message);

  $('myTaskText').value = '';
  await loadAllFromSupabase();
  goTab('mytasks');
}


function renderAssignees() {
  const el = $('myTaskAssignee');
  if (!el) return;

  const profiles = state.profiles && state.profiles.length ? state.profiles : [
    { id: currentUser ? currentUser.id : '', full_name: currentProfile ? currentProfile.full_name : 'Moi', email: currentUser ? currentUser.email : '', role: currentProfile ? currentProfile.role : 'employee' }
  ];

  const general = isAdmin() ? '<option value="">Tâche de journée / générale</option>' : '';
  el.innerHTML = general + profiles.map(p => `<option value="${p.id}">${esc(p.full_name || p.email || 'Employé')} ${p.role ? '— ' + p.role : ''}</option>`).join('');

  if (!isAdmin()) {
    el.value = currentUser.id;
    el.disabled = true;
  } else {
    el.disabled = false;
  }
}

function renderMyTasks() {
  renderSelects();
  renderAssignees();
  if ($('myTasksTitle')) $('myTasksTitle').textContent = 'Tâches';
  if ($('myTaskDate') && !$('myTaskDate').value) $('myTaskDate').value = todayISO();

  const date = ($('myTaskDate') && $('myTaskDate').value) || todayISO();
  const list = $('myTasksList');
  if (!list) return;

  let tasks = state.tasks.filter(t => t.date === date || t.task_date === date);
  if (!isAdmin()) tasks = tasks.filter(t => !t.assignedTo || t.assignedTo === currentUser.id);
  if (!tasks.length) {
    list.innerHTML = '<div class="card">Aucune tâche pour cette date.</div>';
    return;
  }

  const grouped = {};
  tasks.forEach(t => {
    const key = t.jobId || 'general';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  list.innerHTML = Object.entries(grouped).map(([jobId, arr]) => {
    const j = jobById(jobId) || { name: 'Tâches générales' };
    return `<div class="jobRow"><strong>${esc(j.name)}</strong>${arr.map(t => taskHtml(t)).join('')}</div>`;
  }).join('');
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
  renderMyTasks();
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
  if ($('accountGearBtn')) $('accountGearBtn').onclick = () => {
    const menu = $('accountMenu');
    if (menu) menu.classList.toggle('hidden');
  };
  if ($('menuChangePassword')) $('menuChangePassword').onclick = () => {
    const menu = $('accountMenu');
    if (menu) menu.classList.add('hidden');
    showPasswordScreen();
  };
  if ($('menuLogout')) $('menuLogout').onclick = logout;
  $('saveJob').onclick = saveJob;
  $('clearJobForm').onclick = clearJob;
  $('prevMonth').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); };
  $('nextMonth').onclick = () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); };
  $('addMulti').onclick = addMultiDates;
  $('punchIn').onclick = punchIn;
  $('punchOut').onclick = punchOut;
  $('saveExpense').onclick = saveExpense;
  if ($('saveMyTask')) $('saveMyTask').onclick = saveMyTasks;
  if ($('saveManualPunch')) $('saveManualPunch').onclick = saveManualPunch;
  if ($('prevPunchWeek')) $('prevPunchWeek').onclick = () => { selectedPunchWeek = addDays(selectedPunchWeek, -7); renderAll(); };
  if ($('nextPunchWeek')) $('nextPunchWeek').onclick = () => { selectedPunchWeek = addDays(selectedPunchWeek, 7); renderAll(); };
  ['expensePhotoCamera','expensePhotoGallery'].forEach(id => { if ($(id)) $(id).onchange = () => { const f = selectedExpenseFile(); if ($('expensePhotoName')) $('expensePhotoName').textContent = f ? f.name : 'Aucune photo sélectionnée.'; }; });
  if ($('myTaskDate')) $('myTaskDate').onchange = renderMyTasks;
  $('exportPayroll').onclick = exportPayroll;
  $('exportData').onclick = () => download('saran-backup.json', JSON.stringify(state, null, 2), 'application/json');
  if ($('importData')) $('importData').onchange = () => alert('Import désactivé en mode Supabase pour éviter d’écraser la base.');
  if ($('changePasswordBtn')) $('changePasswordBtn').onclick = () => showPasswordScreen();
  if ($('cancelPasswordBtn')) $('cancelPasswordBtn').onclick = async () => { const { data:{session} } = await supabaseClient.auth.getSession(); if (session) await openSession(session); else showLogin(); };
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
    else if (session && typeof recoveryModeRequested === 'function' && recoveryModeRequested()) showPasswordScreen();
    else if (session) await openSession(session);
    else showLogin();
  } catch (e) {
    console.error(e);
    showLogin('Erreur Supabase: ' + e.message);
  }
}


/* =========================
   V10 PRO - UI, réglages, thèmes, vue employé, photos/notes chantiers
   ========================= */
const realIsAdminV10 = isAdmin;
isAdmin = function(){
  return realIsAdminV10() && localStorage.getItem('saran_view_mode') !== 'employee';
};
function isTrueAdmin(){ return realIsAdminV10(); }
function firstName(){
  const n = (currentProfile && (currentProfile.full_name || currentProfile.email)) || (currentUser && currentUser.email) || 'Jesse';
  return String(n).split(' ')[0].split('@')[0] || 'Jesse';
}
function applyTheme(theme){
  const t = theme || localStorage.getItem('saran_theme') || 'sand';
  document.body.setAttribute('data-theme', t);
  localStorage.setItem('saran_theme', t);
}
function setViewMode(mode){
  if (!isTrueAdmin()) return;
  localStorage.setItem('saran_view_mode', mode);
  const menu = $('accountMenu'); if (menu) menu.classList.add('hidden');
  renderAll();
}
const oldApplyRoleV10 = applyRole;
applyRole = function(){
  oldApplyRoleV10();
  if ($('dashFirstName')) $('dashFirstName').textContent = firstName();
  const simulated = localStorage.getItem('saran_view_mode') === 'employee';
  if ($('connectedUser')) $('connectedUser').textContent = simulated ? 'Vue employé' : firstName();
  if ($('viewAsEmployeeBtn')) $('viewAsEmployeeBtn').style.display = isTrueAdmin() && !simulated ? '' : 'none';
  if ($('viewAsAdminBtn')) $('viewAsAdminBtn').style.display = isTrueAdmin() && simulated ? '' : 'none';
};
function currentWeekPaidMinutes(){
  const start = startOfWeek(new Date());
  const end = addDays(start, 7);
  return state.punches.filter(p => new Date(p.start) >= start && new Date(p.start) < end)
    .reduce((sum,p)=>sum+(p.paid_minutes || paidMinutes(p.start,p.end)),0);
}
function todaysPaidMinutes(){
  const iso = todayISO();
  let mins = state.punches.filter(p => dateOnly(p.start) === iso).reduce((sum,p)=>sum+(p.paid_minutes || paidMinutes(p.start,p.end)),0);
  if (state.activePunch && dateOnly(state.activePunch.start) === iso) mins += minutesBetween(state.activePunch.start, new Date().toISOString());
  return mins;
}
function getTodayTasks(){
  const iso = todayISO();
  return state.tasks.filter(t => t.date === iso).slice(0,4);
}
renderToday = function(){
  const iso = todayISO();
  const evs = state.events.filter(e => e.date === iso).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const nextEvents = state.events.filter(e => e.date >= iso).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,3);
  const tasks = getTodayTasks();
  const weekMins = currentWeekPaidMinutes();
  const todayMins = todaysPaidMinutes();
  if ($('dashFirstName')) $('dashFirstName').textContent = firstName();
  if ($('dashTodayHours')) $('dashTodayHours').textContent = h(todayMins);
  if ($('dashWeekHours')) $('dashWeekHours').textContent = h(weekMins);
  if ($('dashWeekProgress')) $('dashWeekProgress').style.width = Math.min(100, (weekMins/(40*60))*100) + '%';
  const activeJob = state.activePunch ? jobById(state.activePunch.jobId) : null;
  if ($('dashCurrentJob')) $('dashCurrentJob').textContent = activeJob ? activeJob.name : (evs[0] ? evs[0].title : 'Aucun chantier');
  if ($('dashCurrentJobSub')) $('dashCurrentJobSub').textContent = activeJob ? (activeJob.address || 'Punch actif') : (evs[0] ? ((jobById(evs[0].jobId)||{}).address || evs[0].time || '') : 'Clique pour voir les chantiers');
  if ($('dashNextTask')) $('dashNextTask').textContent = tasks[0] ? tasks[0].title : 'Aucune tâche';
  if ($('dashPunchStatus')) $('dashPunchStatus').textContent = state.activePunch ? 'En cours' : 'Aucun punch actif';
  if ($('dashPunchBadge')) $('dashPunchBadge').textContent = state.activePunch ? 'Punch actif' : 'Aucun punch actif';
  if ($('dashLiveClock')) $('dashLiveClock').textContent = state.activePunch ? h(minutesBetween(state.activePunch.start, new Date().toISOString())).replace(' h','') : '00:00';
  if ($('dashPunchBtn')) { $('dashPunchBtn').textContent = state.activePunch ? 'Punch Out' : 'Punch In'; $('dashPunchBtn').onclick = () => state.activePunch ? punchOut() : goTab('punch'); }
  if ($('dashPunchEntries')) {
    const rows = state.punches.filter(p => dateOnly(p.start) === iso).slice(-3).reverse().map(p => {
      const j = jobById(p.jobId) || {};
      return `<div class="miniLine"><small>${fmtTime(p.start)}–${fmtTime(p.end)}</small><strong>${esc(j.name || 'Chantier')}</strong><span>${h(p.paid_minutes || paidMinutes(p.start,p.end))}</span></div>`;
    }).join('');
    $('dashPunchEntries').innerHTML = rows || '<div class="emptyState">Aucune entrée de temps aujourd’hui.</div>';
  }
  if ($('dashTasksToday')) {
    $('dashTasksToday').innerHTML = tasks.length ? tasks.map(t => `<div class="miniLine"><small>${t.done?'☑':'☐'}</small><strong>${esc(t.title)}</strong><span>${esc((jobById(t.jobId)||{}).name || '')}</span></div>`).join('') : '<div class="emptyState">Aucune tâche aujourd’hui.</div>';
  }
  if ($('dashRecentExpenses')) {
    const list = (isAdmin()?state.expenses:state.expenses.filter(e=>e.userId===currentUser.id)).slice(-3).reverse();
    $('dashRecentExpenses').innerHTML = list.length ? list.map(e => `<div class="miniLine"><small>${esc(e.date||'')}</small><strong>${esc(e.supplier)}</strong><span>${Number(e.amount||0).toFixed(2)} $</span></div>`).join('') : '<div class="emptyState">Aucune dépense récente.</div>';
  }
  if ($('todayList')) {
    $('todayList').innerHTML = nextEvents.length ? nextEvents.map(e => {
      const d = new Date(e.date+'T00:00:00');
      return `<div class="miniLine"><small>${d.toLocaleDateString('fr-CA',{day:'2-digit',month:'2-digit'})}</small><strong>${esc(e.title)}</strong><span>${esc(e.time||'')}</span></div>`;
    }).join('') : '<div class="emptyState">Rien au calendrier.</div>';
  }
};

function jobExtras(){
  try { return JSON.parse(localStorage.getItem('saran_job_extras') || '{}'); } catch(e){ return {}; }
}
function saveJobExtras(data){ localStorage.setItem('saran_job_extras', JSON.stringify(data)); }
function getJobExtra(id){ const all = jobExtras(); return all[id] || { photos: [], notes: [] }; }
function setJobExtra(id, data){ const all = jobExtras(); all[id] = data; saveJobExtras(all); }
window.addJobPhoto = async function(jobId, inputId){
  const input = $(inputId); const file = input && input.files && input.files[0];
  if (!file) return;
  const dataUrl = await compressImageFile(file, 1600, .76);
  const ex = getJobExtra(jobId);
  ex.photos.unshift({ id: uid(), date: new Date().toISOString(), data: dataUrl });
  setJobExtra(jobId, ex);
  input.value = '';
  renderJobs();
};
window.saveJobJournalNote = function(jobId){
  const el = $('jobNoteInput_'+jobId); if (!el) return;
  const txt = el.value.trim(); if (!txt) return alert('Écris une note avant de sauvegarder.');
  const ex = getJobExtra(jobId);
  ex.notes.unshift({ id: uid(), date: new Date().toISOString(), text: txt, author: firstName() });
  setJobExtra(jobId, ex);
  renderJobs();
};
window.deleteJobPhoto = function(jobId, photoId){
  const ex = getJobExtra(jobId); ex.photos = ex.photos.filter(p=>p.id!==photoId); setJobExtra(jobId, ex); renderJobs();
};
window.deleteJobNote = function(jobId, noteId){
  const ex = getJobExtra(jobId); ex.notes = ex.notes.filter(n=>n.id!==noteId); setJobExtra(jobId, ex); renderJobs();
};
renderJobs = function(){
  const list = $('jobList');
  if (!list) return;
  list.innerHTML = state.jobs.map(j => {
    const ex = getJobExtra(j.id);
    const photos = (ex.photos || []).slice(0,8).map(p => `<div><img src="${p.data}" class="jobMediaThumb" title="${fmtDT(p.date)}"><button class="secondary" style="width:100%;margin-top:5px;padding:6px!important" onclick="deleteJobPhoto('${j.id}','${p.id}')">Retirer</button></div>`).join('');
    const notes = (ex.notes || []).slice(0,5).map(n => `<div class="jobNoteItem"><small>${fmtDT(n.date)} · ${esc(n.author||'')}</small><div>${esc(n.text).replace(/\n/g,'<br>')}</div>${isAdmin()?`<button class="secondary" onclick="deleteJobNote('${j.id}','${n.id}')">Supprimer note</button>`:''}</div>`).join('');
    return `<div class="jobRow jobCardPro"><div class="rowTop"><strong><span class="colorDot" style="background:${j.color}"></span> ${esc(j.name)}</strong><span>${esc(j.address || '')}</span></div><p>${esc(j.notes || '')}</p>
      <div class="jobActions">${isAdmin() ? `<button onclick="editJob('${j.id}')">Modifier</button> <button class="danger" onclick="deleteJob('${j.id}')">Supprimer chantier complet</button>` : ''}</div>
      <div class="jobNoteBox"><strong>📸 Photos du chantier</strong><div class="photoInputs"><label class="fileBtn">Prendre photo<input class="hiddenFile" id="jobCam_${j.id}" type="file" accept="image/*" capture="environment" onchange="addJobPhoto('${j.id}','jobCam_${j.id}')"></label><label class="fileBtn">Choisir galerie<input class="hiddenFile" id="jobGal_${j.id}" type="file" accept="image/*" onchange="addJobPhoto('${j.id}','jobGal_${j.id}')"></label></div><div class="jobMediaGrid">${photos || '<span class="hint">Aucune photo pour ce chantier.</span>'}</div></div>
      <div class="jobNoteBox"><strong>📝 Journal de chantier</strong><textarea id="jobNoteInput_${j.id}" rows="3" placeholder="Ajouter une note de chantier..."></textarea><button onclick="saveJobJournalNote('${j.id}')">Ajouter note</button>${notes || '<p class="hint">Aucune note pour ce chantier.</p>'}</div>
    </div>`;
  }).join('') || '<div class="card">Aucun chantier.</div>';
};

function setupV10Handlers(){
  applyTheme();
  if ($('accountGearBtn')) $('accountGearBtn').onclick = (ev) => { ev.stopPropagation(); const menu = $('accountMenu'); if (menu) menu.classList.toggle('hidden'); };
  if ($('closeSettings')) $('closeSettings').onclick = () => $('accountMenu').classList.add('hidden');
  if ($('menuChangePassword')) $('menuChangePassword').onclick = () => { const menu=$('accountMenu'); if(menu) menu.classList.add('hidden'); showPasswordScreen(); };
  if ($('menuLogout')) $('menuLogout').onclick = logout;
  if ($('viewAsEmployeeBtn')) $('viewAsEmployeeBtn').onclick = () => setViewMode('employee');
  if ($('viewAsAdminBtn')) $('viewAsAdminBtn').onclick = () => setViewMode('admin');
  document.querySelectorAll('.themeBtn').forEach(b => b.onclick = () => applyTheme(b.dataset.theme));
  if ($('clearAppCache')) $('clearAppCache').onclick = async () => { try { if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } } catch(e){} location.reload(true); };
  document.addEventListener('click', (e)=>{ const menu=$('accountMenu'); const gear=$('accountGearBtn'); if(menu && gear && !menu.classList.contains('hidden') && !menu.contains(e.target) && !gear.contains(e.target)) menu.classList.add('hidden'); });
}
const oldSetupHandlersV10 = setupHandlers;
setupHandlers = function(){ oldSetupHandlersV10(); setupV10Handlers(); };

startApp();


/* V10.2 - réglages/thèmes robustes: fonctionne même si les anciens handlers se contredisent */
(function(){
  const THEME_KEY_A = 'saran_theme';
  const THEME_KEY_B = 'saranTheme';
  const themes = ['sand','forest','slate','bronze','night'];
  function $(id){ return document.getElementById(id); }
  function saveTheme(t){
    t = themes.includes(t) ? t : 'sand';
    document.body.setAttribute('data-theme', t);
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY_A, t); localStorage.setItem(THEME_KEY_B, t); } catch(e) {}
    document.querySelectorAll('.themeBtn').forEach(btn => {
      btn.classList.toggle('activeTheme', btn.dataset.theme === t);
      btn.setAttribute('aria-pressed', btn.dataset.theme === t ? 'true' : 'false');
    });
  }
  function openMenu(){ const m=$('accountMenu'); if(m) m.classList.remove('hidden'); }
  function closeMenu(){ const m=$('accountMenu'); if(m) m.classList.add('hidden'); }
  function toggleMenu(){ const m=$('accountMenu'); if(m) m.classList.toggle('hidden'); }
  function bind(){
    const saved = (localStorage.getItem(THEME_KEY_A) || localStorage.getItem(THEME_KEY_B) || 'sand');
    saveTheme(saved);
    const gear = $('accountGearBtn');
    if (gear) {
      gear.onclick = null;
      gear.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggleMenu(); }, true);
      gear.addEventListener('touchend', function(e){ e.preventDefault(); e.stopPropagation(); toggleMenu(); }, {capture:true, passive:false});
    }
    const close = $('closeSettings');
    if (close) close.addEventListener('click', function(e){ e.preventDefault(); closeMenu(); }, true);
    document.addEventListener('click', function(e){
      const btn = e.target.closest && e.target.closest('.themeBtn');
      if (btn) { e.preventDefault(); e.stopPropagation(); saveTheme(btn.dataset.theme || 'sand'); return; }
      const menu = $('accountMenu'); const gear = $('accountGearBtn');
      if (menu && gear && !menu.classList.contains('hidden') && !menu.contains(e.target) && !gear.contains(e.target)) closeMenu();
    }, true);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenu(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
  window.addEventListener('load', bind);
  window.saranApplyTheme = saveTheme;
})();

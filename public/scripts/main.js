// public/scripts/main.js
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, push, set, serverTimestamp, runTransaction } from "firebase/database";

// ---------------------------
// Firebase config (your values)
const firebaseConfig = {
  apiKey: "AIzaSyAfAiSlC1nMEAwZwRZo5kiCfX1ROniOqHU",
  authDomain: "sairadevs.firebaseapp.com",
  databaseURL: "https://sairadevs-default-rtdb.firebaseio.com",
  projectId: "sairadevs",
  storageBucket: "sairadevs.firebasestorage.app",
  messagingSenderId: "496896711495",
  appId: "1:496896711495:web:8f540a1defe94e3b738a62",
  measurementId: "G-0L463NNL74"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---------------------------
// DOM elements
const cookieEl = document.getElementById('cookie');
const usernameEl = document.getElementById('username');
const dateEl = document.getElementById('dateField') || document.getElementById('date');
const timeEl = document.getElementById('timeField') || document.getElementById('date');
const submitForm = document.getElementById('submitForm');
const submitStatus = document.getElementById('submitStatus');
const statActive = document.getElementById('stat-active');
const statSent = document.getElementById('stat-sent');
const statTarget = document.getElementById('stat-target');
const tableBody = document.getElementById('tableBody');
const telemetry = document.getElementById('telemetry');

// ---------------------------
// DB refs
const statsRef = ref(db, 'stats'); // visits, messages
const messagesRef = ref(db, 'messages'); // messages list
const presenceRef = ref(db, 'presence'); // active users

// ---------------------------
// Session / visit tracking
const SESSION_KEY = 'manghi_session_id_v1';
let sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) {
  sessionId = 's_' + Math.random().toString(36).slice(2,10);
  localStorage.setItem(SESSION_KEY, sessionId);
}

const VISIT_MARK_KEY = 'manghi_visit_marked_v1';
const visitedMarked = localStorage.getItem(VISIT_MARK_KEY) === '1';

// ---------------------------
// Presence tracking (active users)
const connectedRef = ref(db, '.info/connected');
onValue(connectedRef, snap => {
  if (snap.val() === true) {
    const myRef = ref(db, 'presence/' + sessionId);
    set(myRef, { ts: serverTimestamp() });
    myRef.onDisconnect().remove();
  }
});

// update active count
onValue(presenceRef, snap => {
  const val = snap.val() || {};
  statActive.innerText = Object.keys(val).length;
});

// ---------------------------
// Visits
if (!visitedMarked) {
  runTransaction(ref(db, 'stats/visits'), current => (current || 0) + 1)
    .then(() => localStorage.setItem(VISIT_MARK_KEY, '1'))
    .catch(console.error);
}

// Update stats UI
onValue(statsRef, snap => {
  const s = snap.val() || {};
  statTarget.innerText = s.visits || 0;
  statSent.innerText = s.messages || 0;
  if (telemetry) telemetry.innerText = 'Last updated: ' + new Date().toLocaleString();
});

// ---------------------------
// Messages listener
onValue(messagesRef, snap => {
  const data = snap.val() || {};
  renderMessages(data);
});

function renderMessages(dataObj) {
  const rows = [];
  const keys = Object.keys(dataObj || {});
  keys.sort((a,b) => (dataObj[a].timestamp||0) - (dataObj[b].timestamp||0));
  keys.forEach((k, idx) => {
    const item = dataObj[k];
    const username = item.username || 'Anonymous';
    const date = item.date || new Date(item.timestamp).toLocaleDateString();
    const time = item.time || new Date(item.timestamp).toLocaleTimeString();
    rows.push(`
      <tr>
        <td>${idx+1}</td>
        <td>${escapeHtml(username)}</td>
        <td style="width:130px">${escapeHtml(date)}</td>
        <td style="width:90px;text-align:right">${escapeHtml(time)}</td>
      </tr>
    `);
  });
  tableBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="4" style="padding:18px;text-align:center;color:#64748b">No messages yet</td></tr>';
}

// ---------------------------
// Form submit
submitForm.addEventListener('submit', async ev => {
  ev.preventDefault();
  submitStatus.innerText = '';

  const message = (cookieEl.value||'').trim();
  const username = (usernameEl.value||'').trim() || 'Anonymous';
  const dateVal = dateEl ? dateEl.value.trim() : '';
  const timeVal = timeEl ? timeEl.value.trim() : '';

  if (!message) {
    showNotification('Please enter a message first');
    return;
  }

  const timestamp = Date.now();
  const payload = { username, message, date: dateVal||new Date(timestamp).toLocaleDateString(), time: timeVal||new Date(timestamp).toLocaleTimeString(), timestamp };

  try {
    // push to Firebase messages
    await push(messagesRef, payload);
    // increment total messages
    await runTransaction(ref(db, 'stats/messages'), current => (current||0)+1);
    // send to telegram via serverless function
    await fetch('/api/sendTelegram', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });

    cookieEl.value = '';
    submitStatus.innerText = 'Sent';
    showNotification('Message sent');
  } catch(err) {
    console.error(err);
    submitStatus.innerText = 'Error';
    showNotification('Failed to send.');
  }
});

// ---------------------------
// Helpers
function showNotification(text, ms=3500){
  let notif = document.getElementById('notification');
  let notifText = document.getElementById('notification-text');
  if(!notif){
    notif = document.createElement('div');
    notif.id='notification';
    notif.className='notification show';
    notifText=document.createElement('span');
    notifText.id='notification-text';
    notif.appendChild(notifText);
    document.body.appendChild(notif);
  }
  notif.classList.add('show');
  notifText.innerText=text;
  setTimeout(()=>notif.classList.remove('show'), ms);
}

function escapeHtml(s=''){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

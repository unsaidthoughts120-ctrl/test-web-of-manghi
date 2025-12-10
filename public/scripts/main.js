// public/scripts/main.js
// Client logic: Firebase Realtime Database based persistence + presence + UI updates.
// IMPORTANT: replace the placeholder firebaseConfig below with your project's config.

(function () {
  // ---------------------------
  // CONFIG - set YOUR firebase config here
  // ---------------------------
  // Get these values from Firebase console -> Project settings -> SDK setup
  const firebaseConfig = {
    apiKey: "AIzaSyAfAiSlC1nMEAwZwRZo5kiCfX1ROniOqHU",
    authDomain: "sairadevs.firebaseapp.com",
    databaseURL: "https://sairadevs-default-rtdb.firebaseio.com", // e.g. https://your-project-id-default-rtdb.firebaseio.com
    projectId: "sairadevs",
    storageBucket: "sairadevs.firebasestorage.app",
    messagingSenderId: "496896711495",
    appId: "1:496896711495:web:8f540a1defe94e3b738a62"
  };

  // ---------------------------
  // Load Firebase compat libs dynamically (so you don't need to edit HTML)
  // ---------------------------
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });

  async function start() {
    // Load firebase compat libs
    try {
      await loadScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js');
    } catch (e) {
      console.error('Failed to load firebase scripts', e);
      showNotification('Failed to load Firebase. See console.');
      return;
    }

    // init firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    // DOM refs (must match your HTML elements)
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

    // nodes in DB
    const statsRef = db.ref('stats'); // { visits, messages }
    const messagesRef = db.ref('messages'); // list of messages
    const presenceRef = db.ref('presence'); // connected clients

    // Session identification (persist to localStorage so refresh doesn't double-increment per session)
    const SESSION_KEY = 'manghi_session_id_v1';
    let sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = 's_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SESSION_KEY, sessionId);
    }

    // Only count a visit once per browser sessionId:
    const VISIT_MARK_KEY = 'manghi_visit_marked_v1';
    const visitedMarked = localStorage.getItem(VISIT_MARK_KEY) === '1';

    // ---------- Presence logic (active users) ----------
    // Implementation follows Firebase presence pattern:
    // On connected: set presenceRef/{sessionId} = { ts: now }, onDisconnect remove it.
    const connectedRef = db.ref('.info/connected');
    connectedRef.on('value', snap => {
      const connected = !!snap.val();
      if (connected) {
        const myRef = presenceRef.child(sessionId);
        myRef.set({ ts: firebase.database.ServerValue.TIMESTAMP });
        myRef.onDisconnect().remove();

        statActive.innerText = '1'; // local optimistic update
      } else {
        statActive.innerText = '0';
      }
    });

    // watch presence list and update active count
    presenceRef.on('value', snap => {
      const val = snap.val() || {};
      const activeCount = Object.keys(val).length;
      statActive.innerText = String(activeCount);
    });

    // ---------- Visits logic ----------
    // Increment (atomically) visiting count only once per session id
    if (!visitedMarked) {
      statsRef.child('visits').transaction(current => (current || 0) + 1)
        .then(() => {
          localStorage.setItem(VISIT_MARK_KEY, '1');
        })
        .catch(err => {
          console.error('Failed to mark visit', err);
        });
    }

    // Listen to stats and update UI
    statsRef.on('value', snap => {
      const s = snap.val() || {};
      statTarget.innerText = String(s.visits || 0);
      statSent.innerText = String(s.messages || 0);
      const ts = new Date().toLocaleString();
      if (telemetry) telemetry.innerText = `Last updated: ${ts}`;
    });

    // ---------- Messages list (auto-refresh) ----------
    // Keep latest 200 messages to avoid huge downloads
    messagesRef.limitToLast(200).on('value', snap => {
      const data = snap.val() || {};
      renderMessages(data);
    });

    function renderMessages(dataObj) {
      const rows = [];
      const keys = Object.keys(dataObj || {});
      // sort by timestamp ascending
      keys.sort((a, b) => (dataObj[a].timestamp || 0) - (dataObj[b].timestamp || 0));
      keys.forEach((k, idx) => {
        const item = dataObj[k];
        const username = item.username || 'Anonymous';
        const date = item.date || new Date(item.timestamp).toLocaleDateString();
        const time = item.time || new Date(item.timestamp).toLocaleTimeString();
        rows.push(`
          <tr>
            <td>${idx + 1}</td>
            <td>${escapeHtml(username)}</td>
            <td style="width:130px">${escapeHtml(date)}</td>
            <td style="width:90px;text-align:right">${escapeHtml(time)}</td>
          </tr>
        `);
      });

      tableBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="4" style="padding:18px;text-align:center;color:#64748b">No messages yet</td></tr>';
    }

    // ---------- Form submit ----------
    submitForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      submitStatus.innerText = '';

      const message = (cookieEl.value || '').trim();
      const username = (usernameEl.value || '').trim() || 'Anonymous';
      const dateVal = (dateEl && dateEl.value) ? dateEl.value.trim() : '';
      const timeVal = (timeEl && timeEl.value) ? timeEl.value.trim() : '';

      if (!message) {
        showNotification('Please enter a message first');
        return;
      }

      // Create message object
      const timestamp = Date.now();
      const payload = {
        username,
        message,
        date: dateVal || new Date(timestamp).toLocaleDateString(),
        time: timeVal || new Date(timestamp).toLocaleTimeString(),
        timestamp
      };

      try {
        // push to messages list
        const newRef = messagesRef.push();
        await newRef.set(payload);

        // increment messages stat atomically
        await statsRef.child('messages').transaction(current => (current || 0) + 1);

        // call serverless endpoint to notify telegram (keeps bot token secret)
        // Make sure your site is hosted on Vercel where /api/sendTelegram exists
        await fetch('/api/sendTelegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        cookieEl.value = '';
        submitStatus.innerText = 'Sent';
        showNotification('Message sent');
      } catch (err) {
        console.error('Submit error', err);
        submitStatus.innerText = 'Error';
        showNotification('Failed to send. Check console.');
      }
    });

    // ---------- Helpers ----------
    function showNotification(text, ms = 3500) {
      // simple transient notification using existing notification element if present
      let notif = document.getElementById('notification');
      let notifText = document.getElementById('notification-text');
      if (!notif) {
        notif = document.createElement('div');
        notif.id = 'notification';
        notif.className = 'notification show';
        notifText = document.createElement('span');
        notifText.id = 'notification-text';
        notif.appendChild(notifText);
        document.body.appendChild(notif);
      }
      notif.classList.add('show');
      notifText.innerText = text;
      setTimeout(() => notif.classList.remove('show'), ms);
    }

    function escapeHtml(s = '') {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // End of start()
  }

  // Start the app
  start();
})();

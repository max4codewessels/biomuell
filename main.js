// Authentifizierungsdaten
const USERS = {
  'max': 'maxistdoof',
  'maya': 'YAD'
};

// KV-Storage-Simulation (in einem echten Worker würdest du eine KV-Datenbank verwenden)
let kvStore = new Map();
let authTokens = new Map();

// Event-Handler für Fetch-Requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // API-Endpunkte
  if (url.pathname === '/api/login') {
    event.respondWith(handleLogin(event.request));
  } else if (url.pathname === '/api/logout') {
    event.respondWith(handleLogout(event.request));
  } else if (url.pathname === '/api/runterbringen') {
    event.respondWith(handleRunterbringen(event.request));
  } else if (url.pathname === '/api/stats') {
    event.respondWith(handleGetStats(event.request));
  } else if (url.pathname === '/api/history') {
    event.respondWith(handleGetHistory(event.request));
  } else if (url.pathname === '/adminpanel') {
    event.respondWith(serveAdminPanel(event.request));
  } else {
    event.respondWith(serveMainPage(event.request));
  }
});

// Login-Handler
async function handleLogin(request) {
  try {
    const { username, password } = await request.json();
    
    if (USERS[username] && USERS[username] === password) {
      const token = generateToken();
      authTokens.set(token, username);
      
      return new Response(JSON.stringify({ success: true, token }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth_token=${token}; Path=/; Max-Age=86400`
        }
      });
    }
    
    return new Response(JSON.stringify({ success: false, error: 'Falsche Anmeldedaten' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: 'Ungültige Anfrage' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Logout-Handler
async function handleLogout(request) {
  const token = getTokenFromRequest(request);
  authTokens.delete(token);
  
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'auth_token=; Path=/; Max-Age=0'
    }
  });
}

// Runterbringen-Handler
async function handleRunterbringen(request) {
  const token = getTokenFromRequest(request);
  const username = authTokens.get(token);
  
  if (!username) {
    return new Response(JSON.stringify({ success: false, error: 'Nicht angemeldet' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Bestätigung immer geben (in der Frontend-Implementierung würde man confirm() verwenden)
  const timestamp = new Date().toISOString();
  
  // Aktuelle Statistik abrufen
  let userStats = kvStore.get(`stats:${username}`) || { count: 0, lastTime: null };
  userStats.count++;
  userStats.lastTime = timestamp;
  
  // In KV speichern
  kvStore.set(`stats:${username}`, userStats);
  
  // History-Eintrag hinzufügen
  let history = kvStore.get('history') || [];
  history.push({ username, timestamp });
  kvStore.set('history', history);
  
  return new Response(JSON.stringify({ 
    success: true, 
    count: userStats.count,
    timestamp 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Statistik abrufen
async function handleGetStats(request) {
  const token = getTokenFromRequest(request);
  const username = authTokens.get(token);
  
  if (!username) {
    return new Response(JSON.stringify({ success: false, error: 'Nicht angemeldet' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Alle Statistiken sammeln
  const allStats = {};
  for (const [key, value] of kvStore) {
    if (key.startsWith('stats:')) {
      const user = key.split(':')[1];
      allStats[user] = value;
    }
  }
  
  return new Response(JSON.stringify({ success: true, stats: allStats }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// History abrufen
async function handleGetHistory(request) {
  const token = getTokenFromRequest(request);
  const username = authTokens.get(token);
  
  if (!username) {
    return new Response(JSON.stringify({ success: false, error: 'Nicht angemeldet' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const history = kvStore.get('history') || [];
  
  return new Response(JSON.stringify({ success: true, history }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Admin-Panel servieren
async function serveAdminPanel(request) {
  const token = getTokenFromRequest(request);
  const username = authTokens.get(token);
  
  if (!username) {
    return redirectToLogin();
  }
  
  const history = kvStore.get('history') || [];
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Panel</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .timeline { position: relative; max-width: 800px; margin: 0 auto; }
        .timeline-item { padding: 10px 20px; margin: 10px 0; background: #f0f0f0; border-left: 4px solid #4CAF50; }
        .timeline-time { color: #666; font-size: 0.9em; }
        .timeline-user { font-weight: bold; color: #333; }
        .logout-btn { background: #f44336; color: white; border: none; padding: 10px 20px; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>Admin Panel</h1>
      <button class="logout-btn" onclick="logout()">Logout</button>
      <div id="timeline" class="timeline">
        ${history.map(item => `
          <div class="timeline-item">
            <span class="timeline-time">${new Date(item.timestamp).toLocaleString()}</span>
            <span class="timeline-user">${item.username}</span> hat runtergebracht
          </div>
        `).join('')}
      </div>
      
      <script>
        async function logout() {
          await fetch('/api/logout', { method: 'POST' });
          window.location.href = '/';
        }
      </script>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// Hauptseite servieren
async function serveMainPage(request) {
  const token = getTokenFromRequest(request);
  const username = authTokens.get(token);
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Runterbringen Tracker</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
        .login-form, .main-content { max-width: 400px; margin: 0 auto; }
        input, button { margin: 10px; padding: 10px; width: 200px; }
        .comparison { font-size: 24px; margin: 30px 0; color: #333; }
        .positive { color: green; }
        .negative { color: red; }
        .runter-btn { background: #4CAF50; color: white; border: none; padding: 15px 30px; font-size: 18px; cursor: pointer; }
        .logout-btn { background: #f44336; color: white; border: none; padding: 10px 20px; cursor: pointer; }
        .admin-link { display: block; margin: 20px; color: #2196F3; }
      </style>
    </head>
    <body>
      ${!username ? `
        <div class="login-form">
          <h1>Anmelden</h1>
          <input type="text" id="username" placeholder="Benutzername">
          <input type="password" id="password" placeholder="Passwort">
          <button onclick="login()">Anmelden</button>
        </div>
      ` : `
        <div class="main-content">
          <h1>Willkommen, ${username}!</h1>
          <button class="logout-btn" onclick="logout()">Logout</button>
          <a class="admin-link" href="/adminpanel">Zur Admin-Panel</a>
          
          <div id="comparison" class="comparison">Lade Vergleich...</div>
          
          <button class="runter-btn" onclick="runterbringen()">Runter gebracht</button>
        </div>
      `}
      
      <script>
        ${!username ? `
          async function login() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            const response = await fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            if (data.success) {
              window.location.reload();
            } else {
              alert('Login fehlgeschlagen: ' + data.error);
            }
          }
        ` : `
          async function logout() {
            await fetch('/api/logout', { method: 'POST' });
            window.location.reload();
          }
          
          async function runterbringen() {
            if (confirm('Wirklich runterbringen?')) {
              const response = await fetch('/api/runterbringen', {
                method: 'POST',
                credentials: 'include'
              });
              const data = await response.json();
              if (data.success) {
                loadComparison();
              }
            }
          }
          
          async function loadComparison() {
            const response = await fetch('/api/stats', { credentials: 'include' });
            const data = await response.json();
            
            if (data.success) {
              const stats = data.stats;
              const users = Object.keys(stats);
              
              if (users.length >= 2) {
                const currentUser = '${username}';
                const otherUser = users.find(u => u !== currentUser);
                
                const myCount = stats[currentUser]?.count || 0;
                const otherCount = stats[otherUser]?.count || 0;
                const diff = myCount - otherCount;
                
                document.getElementById('comparison').innerHTML = \`
                  <div>\${currentUser}: \${myCount}</div>
                  <div>\${otherUser}: \${otherCount}</div>
                  <div class="\${diff >= 0 ? 'positive' : 'negative'}">
                    \${diff >= 0 ? '+' : ''}\${diff}
                  </div>
                \`;
              } else {
                document.getElementById('comparison').innerHTML = 'Warte auf zweiten Spieler...';
              }
            }
          }
          
          // Initialen Vergleich laden
          loadComparison();
        `}
      </script>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// Hilfsfunktionen
function generateToken() {
  return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

function getTokenFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const authCookie = cookies.find(c => c.startsWith('auth_token='));
    if (authCookie) {
      return authCookie.split('=')[1];
    }
  }
  return null;
}

function redirectToLogin() {
  return new Response('Redirecting to login...', {
    status: 302,
    headers: { 'Location': '/' }
  });
}

// Worker-Installation
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});
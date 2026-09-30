let globalData = [];

async function handleLogin(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const errBox = document.getElementById('login-err');
  const loginBtn = document.getElementById('loginBtn');

  errBox.style.color = '#38bdf8';
  errBox.innerText = 'Verifying credentials...';
  loginBtn.disabled = true;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();

    if (res.ok && data.success) {
      errBox.innerText = '';
      sessionStorage.setItem('adminToken', data.token);
      
      document.getElementById('login-section').classList.add('hidden');
      document.getElementById('dashboard-section').classList.remove('hidden');
      
      await loadDashboard();
    } else {
      errBox.style.color = '#ef4444';
      errBox.innerText = data.error || 'Invalid admin ID or password';
    }
  } catch (err) {
    errBox.style.color = '#ef4444';
    errBox.innerText = 'Connection error: ' + err.message;
  } finally {
    loginBtn.disabled = false;
  }
}

async function loadDashboard() {
  const token = sessionStorage.getItem('adminToken');
  const statusBox = document.getElementById('data-status');
  if (!token) return;

  try {
    const res = await fetch('/api/admin/data', {
      headers: { 'x-admin-token': token }
    });

    if (!res.ok) {
      const errText = await res.text();
      statusBox.style.color = '#ef4444';
      statusBox.innerText = 'Failed to load records (' + res.status + '): ' + errText;
      return;
    }

    globalData = await res.json();
    statusBox.innerText = 'Total students: ' + globalData.length;

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (globalData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">No registered students found in database.</td></tr>';
      return;
    }

    globalData.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${s.name || '-'}</strong></td>
        <td>${s.email || '-'}</td>
        <td>${s.phone || '-'}</td>
        <td>${s.course || '-'}</td>
        <td>${s.job_field || '-'}</td>
        <td>${s.linkedin && s.linkedin !== 'Not provided' ? '<a href="' + s.linkedin + '" target="_blank" style="color: #38bdf8;">Profile</a>' : 'None'}</td>
        <td>${s.generated_cv && s.generated_cv !== 'Not generated yet' ? '<div class="cv-text">' + s.generated_cv + '</div>' : '<span style="color: #94a3b8;">Not generated yet</span>'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    statusBox.style.color = '#ef4444';
    statusBox.innerText = 'Network error fetching records: ' + err.message;
  }
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(globalData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'students-master-export.json';
  a.click();
}

function logout() {
  sessionStorage.removeItem('adminToken');
  document.getElementById('dashboard-section').classList.add('hidden');
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('login-err').innerText = '';
}

// Bind button listeners cleanly
window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (form) form.addEventListener('submit', handleLogin);

  const dlBtn = document.getElementById('downloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', downloadJSON);

  const outBtn = document.getElementById('logoutBtn');
  if (outBtn) outBtn.addEventListener('click', logout);

  if (sessionStorage.getItem('adminToken')) {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    loadDashboard();
  }
});

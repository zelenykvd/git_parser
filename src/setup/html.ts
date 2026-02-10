export function getWizardHtml(): string {
  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Parser — Setup Wizard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .spinner { border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; width: 20px; height: 20px; animation: spin .7s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .fade-in { animation: fadeIn .3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-xl">
    <!-- Progress bar -->
    <div class="mb-6">
      <div class="flex justify-between text-xs text-gray-400 mb-1">
        <span id="step-label">Step 1 of 6</span>
        <span id="step-name"></span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div id="progress-bar" class="bg-blue-500 h-2 rounded-full transition-all duration-500" style="width:16.6%"></div>
      </div>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-xl shadow-lg p-8">
      <!-- Step 1: Welcome -->
      <div id="step-1" class="step fade-in">
        <h1 class="text-2xl font-bold mb-2">Telegram Parser Setup</h1>
        <p class="text-gray-500 mb-6">Let's configure your instance. This will take a couple of minutes.</p>
        <h3 class="font-semibold mb-3">Prerequisites</h3>
        <div id="docker-status" class="flex items-center gap-2 mb-6 p-3 rounded-lg bg-gray-50">
          <span class="spinner"></span>
          <span class="text-gray-500">Checking Docker...</span>
        </div>
        <button onclick="goToStep(2)" id="btn-start" disabled class="w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition">Start Setup</button>
      </div>

      <!-- Step 2: Database -->
      <div id="step-2" class="step hidden fade-in">
        <h2 class="text-xl font-bold mb-2">Database Setup</h2>
        <p class="text-gray-500 mb-6">Starting PostgreSQL and running migrations.</p>
        <div class="space-y-3" id="db-steps">
          <div id="db-docker" class="flex items-center gap-2 text-gray-400"><span class="w-5 text-center">&#9679;</span> Starting PostgreSQL container</div>
          <div id="db-wait" class="flex items-center gap-2 text-gray-400"><span class="w-5 text-center">&#9679;</span> Waiting for database to be ready</div>
          <div id="db-migrate" class="flex items-center gap-2 text-gray-400"><span class="w-5 text-center">&#9679;</span> Running migrations</div>
        </div>
        <div id="db-error" class="hidden mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm"></div>
        <button onclick="goToStep(3)" id="btn-db-next" disabled class="mt-6 w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition">Continue</button>
      </div>

      <!-- Step 3: Admin -->
      <div id="step-3" class="step hidden fade-in">
        <h2 class="text-xl font-bold mb-2">Admin Account</h2>
        <p class="text-gray-500 mb-6">Set up credentials for the admin panel.</p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input id="admin-user" type="text" value="admin" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input id="admin-pass" type="password" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none" placeholder="Min 6 characters">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input id="admin-pass2" type="password" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
          </div>
          <div id="admin-error" class="hidden p-3 bg-red-50 text-red-600 rounded-lg text-sm"></div>
        </div>
        <button onclick="validateAdmin()" class="mt-6 w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition">Continue</button>
      </div>

      <!-- Step 4: Telegram API -->
      <div id="step-4" class="step hidden fade-in">
        <h2 class="text-xl font-bold mb-2">Telegram API</h2>
        <p class="text-gray-500 mb-4">Get your API credentials from <a href="https://my.telegram.org" target="_blank" class="text-blue-500 underline">my.telegram.org</a> &rarr; API development tools.</p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">API ID <span class="text-red-400">*</span></label>
            <input id="tg-api-id" type="text" inputmode="numeric" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none" placeholder="e.g. 12345678">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">API Hash <span class="text-red-400">*</span></label>
            <input id="tg-api-hash" type="text" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none" placeholder="e.g. a1b2c3d4...">
          </div>
          <hr class="my-2">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Bot Token <span class="text-gray-400 text-xs">(optional, for publishing)</span></label>
            <input id="tg-bot-token" type="text" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none" placeholder="123456:ABC-DEF...">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Target Channel ID <span class="text-gray-400 text-xs">(optional)</span></label>
            <input id="tg-target" type="text" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none" placeholder="e.g. -1001234567890">
          </div>
          <div id="tg-api-error" class="hidden p-3 bg-red-50 text-red-600 rounded-lg text-sm"></div>
        </div>
        <button onclick="validateTgApi()" class="mt-6 w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition">Continue</button>
      </div>

      <!-- Step 5: Telegram Session -->
      <div id="step-5" class="step hidden fade-in">
        <h2 class="text-xl font-bold mb-2">Telegram Authorization</h2>
        <p class="text-gray-500 mb-4">Sign in to your Telegram account to enable channel parsing.</p>

        <!-- Phone input -->
        <div id="tg-phone-form">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input id="tg-phone" type="tel" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none" placeholder="+380...">
          </div>
          <button onclick="startTgAuth()" id="btn-tg-start" class="w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition">Send Code</button>
        </div>

        <!-- Code input -->
        <div id="tg-code-form" class="hidden">
          <div class="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm mb-4">A verification code has been sent to your Telegram app.</div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
            <input id="tg-code" type="text" inputmode="numeric" maxlength="5" class="w-full border rounded-lg px-3 py-2 text-center text-2xl tracking-widest focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none" placeholder="12345">
          </div>
          <button onclick="submitTgCode()" id="btn-tg-code" class="w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition">Verify Code</button>
        </div>

        <!-- 2FA password -->
        <div id="tg-pass-form" class="hidden">
          <div class="p-3 bg-yellow-50 text-yellow-700 rounded-lg text-sm mb-4">Your account has 2FA enabled. Please enter your cloud password.</div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">2FA Password</label>
            <input id="tg-2fa" type="password" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
          </div>
          <button onclick="submitTgPassword()" id="btn-tg-pass" class="w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition">Submit Password</button>
        </div>

        <!-- Success -->
        <div id="tg-auth-success" class="hidden">
          <div class="p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <span class="font-medium">Telegram authorized successfully!</span>
          </div>
          <button onclick="goToStep(6)" class="mt-6 w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition">Continue</button>
        </div>

        <!-- Skip option -->
        <div id="tg-skip" class="mt-4 text-center">
          <button onclick="skipTgAuth()" class="text-sm text-gray-400 hover:text-gray-600">Skip for now (can configure later)</button>
        </div>

        <div id="tg-auth-error" class="hidden mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm"></div>
      </div>

      <!-- Step 6: LLM -->
      <div id="step-6" class="step hidden fade-in">
        <h2 class="text-xl font-bold mb-2">LLM Configuration</h2>
        <p class="text-gray-500 mb-4">Configure the language model for translation.</p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">API Key <span class="text-red-400">*</span></label>
            <input id="llm-key" type="password" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
            <input id="llm-url" type="url" value="https://api.voidai.app/v1" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <input id="llm-model" type="text" value="gpt-5.1" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
          </div>
          <hr class="my-2">
          <h3 class="text-sm font-semibold text-gray-700">Poller Settings</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-gray-500 mb-1">Poll Interval (ms)</label>
              <input id="poll-interval" type="number" value="60000" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Initial Sync (days)</label>
              <input id="poll-days" type="number" value="30" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none">
            </div>
          </div>
          <div id="llm-test-result" class="hidden p-3 rounded-lg text-sm"></div>
          <button onclick="testLlm()" id="btn-test-llm" class="w-full border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition">Test Connection</button>
          <div id="llm-error" class="hidden p-3 bg-red-50 text-red-600 rounded-lg text-sm"></div>
        </div>
        <button onclick="validateLlm()" class="mt-6 w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition">Continue</button>
      </div>

      <!-- Step 7: Review & Install -->
      <div id="step-7" class="step hidden fade-in">
        <h2 class="text-xl font-bold mb-2">Review & Install</h2>
        <p class="text-gray-500 mb-4">Review your configuration before finalizing.</p>
        <div id="review-list" class="space-y-2 text-sm"></div>
        <button onclick="completeSetup()" id="btn-complete" class="mt-6 w-full bg-green-500 text-white py-2.5 rounded-lg font-medium hover:bg-green-600 transition">Complete Setup</button>
        <div id="complete-status" class="hidden mt-4 p-3 rounded-lg text-sm"></div>
      </div>
    </div>

    <!-- Back button (shown from step 3+) -->
    <div class="mt-4 text-center">
      <button onclick="goBack()" id="btn-back" class="hidden text-sm text-gray-400 hover:text-gray-600">&larr; Back</button>
    </div>
  </div>

<script>
const state = {
  step: 1,
  adminUser: 'admin',
  adminPass: '',
  tgApiId: '',
  tgApiHash: '',
  tgBotToken: '',
  tgTarget: '',
  tgSession: '',
  llmKey: '',
  llmUrl: 'https://api.voidai.app/v1',
  llmModel: 'gpt-5.1',
  pollInterval: '60000',
  pollDays: '30',
};

const totalSteps = 7;

function goToStep(n) {
  document.querySelectorAll('.step').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById('step-' + n);
  if (el) { el.classList.remove('hidden'); el.classList.add('fade-in'); }
  state.step = n;
  document.getElementById('step-label').textContent = 'Step ' + Math.min(n, 6) + ' of 6';
  document.getElementById('progress-bar').style.width = (n / totalSteps * 100) + '%';
  document.getElementById('btn-back').classList.toggle('hidden', n <= 2);

  const names = ['', 'Welcome', 'Database', 'Admin', 'Telegram API', 'Telegram Auth', 'LLM Config', 'Review'];
  document.getElementById('step-name').textContent = names[n] || '';

  if (n === 2) runDbSetup();
  if (n === 7) buildReview();
}

function goBack() {
  if (state.step > 1) goToStep(state.step - 1);
}

// ====== Step 1: Docker check ======
async function checkDocker() {
  try {
    const res = await fetch('/setup/prerequisites');
    const data = await res.json();
    const el = document.getElementById('docker-status');
    if (data.docker) {
      el.innerHTML = '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span class="text-green-700">Docker is running</span>';
      document.getElementById('btn-start').disabled = false;
    } else {
      el.innerHTML = '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg><span class="text-red-600">' + (data.error || 'Docker not available') + '</span>';
    }
  } catch (e) {
    document.getElementById('docker-status').innerHTML = '<span class="text-red-600">Failed to check prerequisites</span>';
  }
}

// ====== Step 2: Database setup ======
async function runDbSetup() {
  const steps = ['db-docker', 'db-wait', 'db-migrate'];
  const setStatus = (id, status) => {
    const el = document.getElementById(id);
    if (status === 'running') {
      el.querySelector('span').innerHTML = '<span class="spinner"></span>';
      el.className = 'flex items-center gap-2 text-blue-600';
    } else if (status === 'done') {
      el.querySelector('span').innerHTML = '&#10003;';
      el.className = 'flex items-center gap-2 text-green-600';
    } else if (status === 'error') {
      el.querySelector('span').innerHTML = '&#10007;';
      el.className = 'flex items-center gap-2 text-red-600';
    }
  };

  try {
    setStatus('db-docker', 'running');
    let res = await fetch('/setup/db/start', { method: 'POST' });
    let data = await res.json();
    if (!data.ok) throw new Error(data.error);
    setStatus('db-docker', 'done');

    setStatus('db-wait', 'running');
    res = await fetch('/setup/db/wait', { method: 'POST' });
    data = await res.json();
    if (!data.ok) throw new Error(data.error);
    setStatus('db-wait', 'done');

    setStatus('db-migrate', 'running');
    res = await fetch('/setup/db/migrate', { method: 'POST' });
    data = await res.json();
    if (!data.ok) throw new Error(data.error);
    setStatus('db-migrate', 'done');

    document.getElementById('btn-db-next').disabled = false;
  } catch (e) {
    const current = steps.find(id => document.getElementById(id).className.includes('blue'));
    if (current) setStatus(current, 'error');
    const errEl = document.getElementById('db-error');
    errEl.classList.remove('hidden');
    errEl.textContent = e.message;
  }
}

// ====== Step 3: Admin validation ======
function validateAdmin() {
  const user = document.getElementById('admin-user').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const pass2 = document.getElementById('admin-pass2').value;
  const errEl = document.getElementById('admin-error');
  errEl.classList.add('hidden');

  if (!user) { showError(errEl, 'Username is required'); return; }
  if (pass.length < 6) { showError(errEl, 'Password must be at least 6 characters'); return; }
  if (pass !== pass2) { showError(errEl, 'Passwords do not match'); return; }

  state.adminUser = user;
  state.adminPass = pass;
  goToStep(4);
}

// ====== Step 4: Telegram API validation ======
function validateTgApi() {
  const apiId = document.getElementById('tg-api-id').value.trim();
  const apiHash = document.getElementById('tg-api-hash').value.trim();
  const errEl = document.getElementById('tg-api-error');
  errEl.classList.add('hidden');

  if (!apiId || !apiHash) { showError(errEl, 'API ID and API Hash are required'); return; }
  if (!/^\\d+$/.test(apiId)) { showError(errEl, 'API ID must be a number'); return; }

  state.tgApiId = apiId;
  state.tgApiHash = apiHash;
  state.tgBotToken = document.getElementById('tg-bot-token').value.trim();
  state.tgTarget = document.getElementById('tg-target').value.trim();
  goToStep(5);
}

// ====== Step 5: Telegram Auth ======
async function startTgAuth() {
  const phone = document.getElementById('tg-phone').value.trim();
  if (!phone) return;
  const errEl = document.getElementById('tg-auth-error');
  errEl.classList.add('hidden');
  setLoading('btn-tg-start', true);

  try {
    const res = await fetch('/setup/telegram/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId: Number(state.tgApiId), apiHash: state.tgApiHash, phone }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    if (data.state === 'awaiting_code') {
      document.getElementById('tg-phone-form').classList.add('hidden');
      document.getElementById('tg-code-form').classList.remove('hidden');
      document.getElementById('tg-skip').classList.add('hidden');
    } else if (data.state === 'success') {
      showTgSuccess(data.session);
    }
  } catch (e) {
    showError(errEl, e.message);
  } finally {
    setLoading('btn-tg-start', false);
  }
}

async function submitTgCode() {
  const code = document.getElementById('tg-code').value.trim();
  if (!code) return;
  const errEl = document.getElementById('tg-auth-error');
  errEl.classList.add('hidden');
  setLoading('btn-tg-code', true);

  try {
    const res = await fetch('/setup/telegram/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    if (data.state === 'awaiting_password') {
      document.getElementById('tg-code-form').classList.add('hidden');
      document.getElementById('tg-pass-form').classList.remove('hidden');
    } else if (data.state === 'success') {
      showTgSuccess(data.session);
    }
  } catch (e) {
    showError(errEl, e.message);
  } finally {
    setLoading('btn-tg-code', false);
  }
}

async function submitTgPassword() {
  const password = document.getElementById('tg-2fa').value;
  if (!password) return;
  const errEl = document.getElementById('tg-auth-error');
  errEl.classList.add('hidden');
  setLoading('btn-tg-pass', true);

  try {
    const res = await fetch('/setup/telegram/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    if (data.state === 'success') {
      showTgSuccess(data.session);
    } else {
      throw new Error('Authentication failed. State: ' + data.state);
    }
  } catch (e) {
    showError(errEl, e.message);
  } finally {
    setLoading('btn-tg-pass', false);
  }
}

function showTgSuccess(session) {
  state.tgSession = session || '';
  document.getElementById('tg-phone-form').classList.add('hidden');
  document.getElementById('tg-code-form').classList.add('hidden');
  document.getElementById('tg-pass-form').classList.add('hidden');
  document.getElementById('tg-skip').classList.add('hidden');
  document.getElementById('tg-auth-success').classList.remove('hidden');
}

function skipTgAuth() {
  state.tgSession = '';
  goToStep(6);
}

// ====== Step 6: LLM ======
function validateLlm() {
  const key = document.getElementById('llm-key').value.trim();
  const errEl = document.getElementById('llm-error');
  errEl.classList.add('hidden');
  if (!key) { showError(errEl, 'API Key is required'); return; }

  state.llmKey = key;
  state.llmUrl = document.getElementById('llm-url').value.trim() || 'https://api.voidai.app/v1';
  state.llmModel = document.getElementById('llm-model').value.trim() || 'gpt-5.1';
  state.pollInterval = document.getElementById('poll-interval').value || '60000';
  state.pollDays = document.getElementById('poll-days').value || '30';
  goToStep(7);
}

async function testLlm() {
  const key = document.getElementById('llm-key').value.trim();
  const url = document.getElementById('llm-url').value.trim();
  const model = document.getElementById('llm-model').value.trim();
  const resultEl = document.getElementById('llm-test-result');
  resultEl.className = 'p-3 rounded-lg text-sm bg-gray-50 text-gray-500';
  resultEl.classList.remove('hidden');
  resultEl.textContent = 'Testing...';

  try {
    const res = await fetch('/setup/llm/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, baseUrl: url, model }),
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.className = 'p-3 rounded-lg text-sm bg-green-50 text-green-700';
      resultEl.textContent = 'Connection successful!';
    } else {
      resultEl.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-600';
      resultEl.textContent = data.error || 'Connection failed';
    }
  } catch (e) {
    resultEl.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-600';
    resultEl.textContent = 'Test failed: ' + e.message;
  }
}

// ====== Step 7: Review ======
function buildReview() {
  const items = [
    ['Admin Username', state.adminUser],
    ['Admin Password', '\\u2022'.repeat(state.adminPass.length)],
    ['Telegram API ID', state.tgApiId],
    ['Telegram API Hash', state.tgApiHash.slice(0, 6) + '...'],
    ['Telegram Session', state.tgSession ? 'Authorized' : 'Skipped'],
    ['Bot Token', state.tgBotToken ? state.tgBotToken.slice(0, 10) + '...' : 'Not set'],
    ['Target Channel', state.tgTarget || 'Not set'],
    ['LLM Provider', state.llmUrl],
    ['LLM Model', state.llmModel],
    ['LLM API Key', state.llmKey.slice(0, 8) + '...'],
    ['Poll Interval', state.pollInterval + 'ms'],
    ['Initial Sync', state.pollDays + ' days'],
  ];

  const el = document.getElementById('review-list');
  el.innerHTML = items.map(([label, value]) =>
    '<div class="flex justify-between py-2 border-b border-gray-100"><span class="text-gray-500">' + label + '</span><span class="font-mono text-gray-800">' + value + '</span></div>'
  ).join('');
}

async function completeSetup() {
  const btn = document.getElementById('btn-complete');
  const statusEl = document.getElementById('complete-status');
  btn.disabled = true;
  btn.textContent = 'Installing...';
  statusEl.className = 'mt-4 p-3 rounded-lg text-sm bg-blue-50 text-blue-700';
  statusEl.classList.remove('hidden');
  statusEl.innerHTML = '<span class="spinner"></span> Writing configuration and starting application...';

  try {
    const res = await fetch('/setup/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    statusEl.className = 'mt-4 p-3 rounded-lg text-sm bg-green-50 text-green-700';
    statusEl.innerHTML = 'Setup complete! Redirecting to login...';

    // Poll until main app is ready
    pollForApp();
  } catch (e) {
    statusEl.className = 'mt-4 p-3 rounded-lg text-sm bg-red-50 text-red-600';
    statusEl.textContent = 'Error: ' + e.message;
    btn.disabled = false;
    btn.textContent = 'Complete Setup';
  }
}

async function pollForApp() {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch('/api/health', { method: 'GET' });
      if (res.ok) {
        window.location.href = '/login';
        return;
      }
    } catch {}
  }
  // Fallback: just redirect
  window.location.href = '/login';
}

// Helpers
function showError(el, msg) {
  el.classList.remove('hidden');
  el.textContent = msg;
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.disabled = true;
    btn.dataset.text = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.text;
  }
}

// Init
checkDocker();
</script>
</body>
</html>`;
}

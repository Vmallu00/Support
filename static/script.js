// ---------- VM CONTROL ----------
const vmStatusBadge = document.getElementById('vmStatusBadge');
const vmDetails = document.getElementById('vmDetails');
const vmActionOutput = document.getElementById('vmActionOutput');
const vmStartBtn = document.getElementById('vmStartBtn');
const vmStopBtn = document.getElementById('vmStopBtn');
const vmCreateBtn = document.getElementById('vmCreateBtn');
const vmRefreshBtn = document.getElementById('vmRefreshBtn');

async function fetchVMStatus() {
    try {
        const res = await fetch('/api/vm/status');
        const data = await res.json();
        const status = data.status || 'unknown';
        const details = data.details || '';

        if (status === 'running') {
            vmStatusBadge.textContent = '🟢 RUNNING';
            vmStatusBadge.style.color = '#50fa7b';
        } else if (status === 'stopped') {
            vmStatusBadge.textContent = '🔴 STOPPED';
            vmStatusBadge.style.color = '#ff5555';
        } else {
            vmStatusBadge.textContent = '⚠️ UNKNOWN';
            vmStatusBadge.style.color = '#f1fa8c';
        }
        vmDetails.textContent = details.trim().split('\n')[0] || '';
    } catch (e) {
        console.error('VM status error', e);
        vmStatusBadge.textContent = '❌ ERROR';
        vmStatusBadge.style.color = '#ff5555';
    }
}

async function vmAction(action, button) {
    const originalText = button.textContent;
    button.textContent = '⏳ ...';
    button.disabled = true;
    vmActionOutput.style.display = 'block';
    vmActionOutput.textContent = '⏳ Executing...';

    try {
        const res = await fetch(`/api/vm/${action}`);
        const data = await res.json();
        if (data.success) {
            vmActionOutput.style.color = '#50fa7b';
            vmActionOutput.textContent = `✅ ${data.output || 'Done.'}`;
        } else {
            vmActionOutput.style.color = '#ff5555';
            vmActionOutput.textContent = `❌ Error: ${data.error || 'Unknown error'}`;
        }
    } catch (e) {
        vmActionOutput.style.color = '#ff5555';
        vmActionOutput.textContent = `❌ Request failed: ${e.message}`;
    }

    button.textContent = originalText;
    button.disabled = false;
    setTimeout(fetchVMStatus, 2000); // refresh status after action
}

// Event listeners
vmStartBtn.addEventListener('click', () => vmAction('start', vmStartBtn));
vmStopBtn.addEventListener('click', () => vmAction('stop', vmStopBtn));
vmCreateBtn.addEventListener('click', () => vmAction('create', vmCreateBtn));
vmRefreshBtn.addEventListener('click', fetchVMStatus);

// Initial load and refresh every 10 seconds
fetchVMStatus();
setInterval(fetchVMStatus, 10000);

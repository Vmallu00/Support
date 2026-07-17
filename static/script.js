// ---------- TAB SWITCHING ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab + '-tab').classList.add('active');

        if (btn.dataset.tab === 'terminal' && terminal) {
            setTimeout(() => {
                fitAddon.fit();
                terminal.focus();
            }, 100);
        }
    });
});

// ---------- STATS POLLING ----------
function formatBytes(bytes) {
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        document.getElementById('cpuValue').textContent = data.cpu.percent + '%';
        document.getElementById('cpuBar').style.width = data.cpu.percent + '%';
        document.getElementById('loadAvg').textContent = data.cpu.load_avg.map(v => v.toFixed(2)).join(' ');

        document.getElementById('ramValue').textContent = data.ram.percent + '%';
        document.getElementById('ramBar').style.width = data.ram.percent + '%';
        document.getElementById('ramUsed').textContent = formatBytes(data.ram.used);
        document.getElementById('ramTotal').textContent = formatBytes(data.ram.total);

        document.getElementById('diskValue').textContent = data.disk.percent + '%';
        document.getElementById('diskBar').style.width = data.disk.percent + '%';
        document.getElementById('diskUsed').textContent = formatBytes(data.disk.used);
        document.getElementById('diskTotal').textContent = formatBytes(data.disk.total);

        document.getElementById('uptimeValue').textContent = formatUptime(data.uptime);

        const wings = document.getElementById('pteroWings');
        const panel = document.getElementById('pteroPanel');
        if (data.pterodactyl.wings) {
            wings.textContent = '🟢 RUNNING';
            wings.style.color = '#50fa7b';
        } else {
            wings.textContent = '🔴 OFFLINE';
            wings.style.color = '#ff5555';
        }
        if (data.pterodactyl.panel) {
            panel.textContent = '🟢 RUNNING';
            panel.style.color = '#50fa7b';
        } else {
            panel.textContent = '🔴 OFFLINE';
            panel.style.color = '#ff5555';
        }
    } catch (e) {
        console.error('Stats fetch error', e);
    }
}

fetchStats();
setInterval(fetchStats, 2000);

// ---------- WEB TERMINAL ----------
const termContainer = document.getElementById('terminal-container');
const terminal = new Terminal({
    cursorBlink: true,
    theme: {
        background: '#0a0e17',
        foreground: '#00e5ff',
        cursor: '#00e5ff',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2'
    }
});
const fitAddon = new FitAddon.FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(termContainer);
fitAddon.fit();

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/terminal`;
const socket = new WebSocket(wsUrl);

socket.onopen = () => {
    terminal.write('\r\n\x1b[1;32m▶ CONNECTED TO VM CONSOLE\x1b[0m\r\n');
    terminal.write('\x1b[1;33m$ \x1b[0m');
    const dims = { cols: terminal.cols, rows: terminal.rows };
    socket.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
};

socket.onmessage = (event) => {
    terminal.write(event.data);
};

socket.onclose = () => {
    terminal.write('\r\n\x1b[1;31m⚠️ CONNECTION LOST. RELOAD PAGE TO RECONNECT.\x1b[0m\r\n');
};

terminal.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
    }
});

window.addEventListener('resize', () => {
    fitAddon.fit();
    if (socket.readyState === WebSocket.OPEN) {
        const dims = { cols: terminal.cols, rows: terminal.rows };
        socket.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
    }
});

// Resize on tab switch
const observer = new MutationObserver(() => {
    if (document.getElementById('terminal-tab').classList.contains('active')) {
        setTimeout(() => { fitAddon.fit(); }, 50);
    }
});
observer.observe(document.getElementById('terminal-tab'), { attributes: true, attributeFilter: ['class'] });

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
    setTimeout(fetchVMStatus, 2000);
}

vmStartBtn.addEventListener('click', () => vmAction('start', vmStartBtn));
vmStopBtn.addEventListener('click', () => vmAction('stop', vmStopBtn));
vmCreateBtn.addEventListener('click', () => vmAction('create', vmCreateBtn));
vmRefreshBtn.addEventListener('click', fetchVMStatus);

fetchVMStatus();
setInterval(fetchVMStatus, 10000);

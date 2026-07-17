from flask import Flask, render_template, jsonify
from flask_sock import Sock
import psutil
import time
import json
import os
import pty
import subprocess
import threading
import fcntl
import termios
import struct
from datetime import datetime

app = Flask(__name__)
sock = Sock(app)

# ---------- PTERODACTYL DETECTION ----------
def get_pterodactyl_status():
    status = {'wings': False, 'panel': False}
    for proc in psutil.process_iter(['name', 'cmdline']):
        try:
            cmdline = ' '.join(proc.info['cmdline'] or [])
            if 'wings' in cmdline or proc.info['name'] == 'wings':
                status['wings'] = True
            if 'php' in cmdline and 'artisan' in cmdline and 'queue:work' in cmdline:
                status['panel'] = True
            if 'nginx' in cmdline and '/var/www/panel' in cmdline:
                status['panel'] = True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return status

# ---------- SYSTEM STATS ----------
def get_system_stats():
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_count = psutil.cpu_count()
    load_avg = psutil.getloadavg() if hasattr(psutil, 'getloadavg') else [0, 0, 0]
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time() - boot_time)
    return {
        'timestamp': datetime.utcnow().isoformat(),
        'status': 'online',
        'cpu': {'percent': cpu_percent, 'cores': cpu_count, 'load_avg': load_avg},
        'ram': {'total': mem.total, 'used': mem.used, 'percent': mem.percent},
        'disk': {'total': disk.total, 'used': disk.used, 'percent': disk.percent},
        'uptime': uptime_seconds,
        'pterodactyl': get_pterodactyl_status()
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stats')
def stats():
    return jsonify(get_system_stats())

# ---------- WEBSOCKET TERMINAL ----------
@sock.route('/terminal')
def handle_terminal(ws):
    master_fd, slave_fd = pty.openpty()
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    process = subprocess.Popen(
        ['/bin/bash'],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        text=False,
        preexec_fn=os.setsid,
        env=env
    )
    os.close(slave_fd)

    def reader():
        try:
            while process.poll() is None:
                try:
                    data = os.read(master_fd, 1024)
                    if data:
                        ws.send(data.decode('utf-8', errors='ignore'))
                except OSError:
                    break
        except Exception:
            pass

    threading.Thread(target=reader, daemon=True).start()

    try:
        while process.poll() is None:
            message = ws.receive()
            if message is None:
                break
            try:
                payload = json.loads(message)
                if payload.get('type') == 'resize':
                    rows = payload.get('rows', 24)
                    cols = payload.get('cols', 80)
                    winsize = struct.pack('HHHH', rows, cols, 0, 0)
                    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                    continue
            except json.JSONDecodeError:
                pass
            os.write(master_fd, message.encode())
    finally:
        process.terminate()
        os.close(master_fd)

# ---------- VM CONTROL (using vm-manager.sh) ----------
def run_vm_command(action):
    script_path = "/usr/local/bin/vm-manager.sh"
    if not os.path.exists(script_path):
        return {"success": False, "error": "vm-manager.sh not found. Install it first."}
    try:
        result = subprocess.run(
            [script_path, action],
            capture_output=True,
            text=True,
            timeout=120
        )
        return {
            "success": result.returncode == 0,
            "output": result.stdout,
            "error": result.stderr
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Command timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.route('/api/vm/status')
def vm_status():
    result = run_vm_command('status')
    output = result.get('output', '')
    if 'Running' in output or 'Attach' in output:
        status = 'running'
    elif 'Stopped' in output or 'not running' in output:
        status = 'stopped'
    else:
        status = 'unknown'
    return jsonify({
        'status': status,
        'details': output,
        'success': result['success']
    })

@app.route('/api/vm/start')
def vm_start():
    return jsonify(run_vm_command('start'))

@app.route('/api/vm/stop')
def vm_stop():
    return jsonify(run_vm_command('stop'))

@app.route('/api/vm/create')
def vm_create():
    return jsonify(run_vm_command('create'))

@app.route('/api/vm/console')
def vm_console():
    return jsonify(run_vm_command('console'))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

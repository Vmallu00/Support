import subprocess
import json

# ---------- VM CONTROL ----------
def run_vm_command(action):
    """Run vm-manager.sh with given action (create, start, stop, status)"""
    script_path = "/usr/local/bin/vm-manager.sh"
    try:
        # Run the script with the action and capture output
        result = subprocess.run(
            [script_path, action],
            capture_output=True,
            text=True,
            timeout=120  # create can take a while
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
    # Parse the output to get running/stopped
    output = result.get('output', '')
    if 'Running' in output or 'Attach' in output:
        status = 'running'
    elif 'Stopped' in output or 'Not found' in output or 'not running' in output:
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
    result = run_vm_command('start')
    return jsonify(result)

@app.route('/api/vm/stop')
def vm_stop():
    result = run_vm_command('stop')
    return jsonify(result)

@app.route('/api/vm/create')
def vm_create():
    result = run_vm_command('create')
    return jsonify(result)

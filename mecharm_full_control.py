from pymycobot import MechArm270
import cv2
import time
import threading
from flask import Flask, Response, render_template_string, request, jsonify

app = Flask(__name__)
camera = None
mc = None
current_angles = [0, 0, 0, 0, 0, 0]
gripper_value = 0

# Command queue: background thread sends latest target to arm at fixed rate
_target_angles = None
_target_gripper = None
_cmd_lock = threading.Lock()
_serial_lock = threading.Lock()

def command_loop():
    """Send latest target to arm every 25ms. Skips if no new command."""
    global _target_angles, _target_gripper
    while True:
        angles = None
        grip = None
        with _cmd_lock:
            if _target_angles is not None:
                angles = list(_target_angles)
                _target_angles = None
            if _target_gripper is not None:
                grip = _target_gripper
                _target_gripper = None
        if angles is not None or grip is not None:
            with _serial_lock:
                try:
                    if angles is not None:
                        mc.send_angles(angles, 100)
                    if grip is not None:
                        mc.set_gripper_value(grip, 80)
                except:
                    pass
        time.sleep(0.025)

HTML = '''<!DOCTYPE html>
<html>
<head>
    <title>MechArm Control</title>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1a1a; color: #0f0; font-family: monospace; overflow: hidden; }
        .container { display: grid; grid-template-columns: 1fr 450px; height: 100vh; }
        .lang-toggle { position: absolute; top: 10px; right: 15px; background: #333; color: #0f0; border: 1px solid #0f0; padding: 4px 10px; font-family: monospace; font-size: 13px; cursor: pointer; border-radius: 3px; z-index: 10; }
        .lang-toggle:hover { background: #0f0; color: #000; }
        .video-panel { background: #000; display: flex; flex-direction: column; border-right: 2px solid #0f0; }
        .video-header { background: #0f0; color: #000; padding: 15px; font-size: 20px; font-weight: bold; text-align: center; }
        .video-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; }
        #video { max-width: 100%; max-height: 100%; border: 2px solid #0f0; }
        .control-panel { background: #111; padding: 20px; overflow-y: auto; }
        .header { background: #0f0; color: #000; padding: 15px; margin: -20px -20px 20px -20px; text-align: center; font-size: 18px; font-weight: bold; }
        .section-title { color: #0f0; font-size: 16px; margin: 20px 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid #0f0; }
        .joint-control { background: #222; border: 2px solid #0f0; border-radius: 5px; padding: 12px; margin-bottom: 12px; }
        .joint-header { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; font-weight: bold; }
        .joint-value { color: #ff0; font-size: 16px; min-width: 60px; text-align: right; }
        .slider { width: 100%; height: 8px; border-radius: 5px; background: #333; outline: none; -webkit-appearance: none; }
        .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #0f0; cursor: pointer; box-shadow: 0 0 10px #0f0; }
        .range-labels { display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 3px; }
        .gripper-control { background: #222; border: 2px solid #ff0; border-radius: 5px; padding: 15px; margin: 15px 0; }
        .gripper-slider { background: linear-gradient(90deg, #333 0%, #ff0 100%); }
        .gripper-slider::-webkit-slider-thumb { background: #ff0; box-shadow: 0 0 10px #ff0; }
        .gripper-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
        .btn { background: #0f0; color: #000; border: none; padding: 10px; font-size: 13px; font-weight: bold; cursor: pointer; border-radius: 5px; margin: 5px 0; }
        .btn:hover { background: #0c0; }
        .btn-gripper { background: #ff0; }
        .btn-gripper:hover { background: #fc0; }
        .status { background: #000; border: 2px solid #0f0; padding: 10px; margin-top: 15px; border-radius: 5px; text-align: center; font-size: 13px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="video-panel">
            <div class="video-header" data-i18n="videoHeader">📹 Live Video Feed</div>
            <div class="video-container">
                <img id="video" src="/video">
            </div>
        </div>
        <div class="control-panel" style="position:relative;">
            <div class="header" data-i18n="header">🤖 Robot Arm Control</div>
            <button class="lang-toggle" onclick="toggleLang()">中文</button>
            
            <div class="section-title" data-i18n="jointControl">⚙️ Joint Control</div>
            
            <div class="joint-control">
                <div class="joint-header"><span data-i18n="j1">J1 Base</span><span class="joint-value" id="v1">0°</span></div>
                <input type="range" class="slider" id="j1" min="-160" max="160" value="0">
                <div class="range-labels"><span>-160°</span><span>+160°</span></div>
            </div>
            
            <div class="joint-control">
                <div class="joint-header"><span>J2</span><span class="joint-value" id="v2">0°</span></div>
                <input type="range" class="slider" id="j2" min="-90" max="90" value="0">
                <div class="range-labels"><span>-90°</span><span>+90°</span></div>
            </div>
            
            <div class="joint-control">
                <div class="joint-header"><span>J3</span><span class="joint-value" id="v3">0°</span></div>
                <input type="range" class="slider" id="j3" min="-180" max="45" value="0">
                <div class="range-labels"><span>-180°</span><span>+45°</span></div>
            </div>
            
            <div class="joint-control">
                <div class="joint-header"><span>J4</span><span class="joint-value" id="v4">0°</span></div>
                <input type="range" class="slider" id="j4" min="-160" max="160" value="0">
                <div class="range-labels"><span>-160°</span><span>+160°</span></div>
            </div>
            
            <div class="joint-control">
                <div class="joint-header"><span>J5</span><span class="joint-value" id="v5">0°</span></div>
                <input type="range" class="slider" id="j5" min="-100" max="100" value="0">
                <div class="range-labels"><span>-100°</span><span>+100°</span></div>
            </div>
            
            <div class="joint-control">
                <div class="joint-header"><span data-i18n="j6">J6 End</span><span class="joint-value" id="v6">0°</span></div>
                <input type="range" class="slider" id="j6" min="-180" max="180" value="0">
                <div class="range-labels"><span>-180°</span><span>+180°</span></div>
            </div>
            
            <div class="section-title" data-i18n="gripperControl">✋ Gripper Control</div>
            
            <div class="gripper-control">
                <div class="joint-header"><span data-i18n="gripperLabel">Gripper</span><span class="joint-value" id="vg" style="color:#ff0;">0%</span></div>
                <input type="range" class="slider gripper-slider" id="gripper" min="0" max="100" value="0">
                <div class="range-labels"><span data-i18n="fullyOpen">Fully Open</span><span data-i18n="fullyClosed">Fully Closed</span></div>
                <div class="gripper-buttons">
                    <button class="btn btn-gripper" onclick="openGripper()" data-i18n="openBtn">🖐️ Open</button>
                    <button class="btn btn-gripper" onclick="closeGripper()" data-i18n="closeBtn">✊ Close</button>
                </div>
            </div>
            
            <button class="btn" onclick="reset()" data-i18n="resetBtn">🏠 Reset All</button>
            <button class="btn" onclick="sync()" data-i18n="syncBtn">📍 Sync Status</button>

            <div class="status" id="st" data-i18n="ready">Ready</div>
        </div>
    </div>
    <script>
        const i18n = {
            en: {
                videoHeader: '📹 Live Video Feed', header: '🤖 Robot Arm Control',
                jointControl: '⚙️ Joint Control', j1: 'J1 Base', j6: 'J6 End',
                gripperControl: '✋ Gripper Control', gripperLabel: 'Gripper',
                fullyOpen: 'Fully Open', fullyClosed: 'Fully Closed',
                openBtn: '🖐️ Open', closeBtn: '✊ Close',
                resetBtn: '🏠 Reset All', syncBtn: '📍 Sync Status',
                ready: 'Ready', synced: '✅ Synced', toggleLabel: '中文',
                error: 'Error', gripperOpen: 'Open', gripperClose: 'Close',
                gripperStatus: (s,v) => `Gripper ${s} → ${v}%`,
                gripperError: (e) => `Gripper error: ${e}`,
                resetDone: '✅ All Reset', genError: (e) => `Error: ${e}`
            },
            zh: {
                videoHeader: '📹 实时视频监控', header: '🤖 机械臂完整控制',
                jointControl: '⚙️ 关节控制', j1: 'J1 底座', j6: 'J6 末端',
                gripperControl: '✋ 夹具控制', gripperLabel: '夹具开合',
                fullyOpen: '完全张开', fullyClosed: '完全闭合',
                openBtn: '🖐️ 张开', closeBtn: '✊ 闭合',
                resetBtn: '🏠 全部归零', syncBtn: '📍 同步状态',
                ready: '就绪', synced: '✅ 已同步', toggleLabel: 'EN',
                error: '错误', gripperOpen: '张开', gripperClose: '闭合',
                gripperStatus: (s,v) => `夹具 ${s} → ${v}%`,
                gripperError: (e) => `夹具错误: ${e}`,
                resetDone: '✅ 全部归零', genError: (e) => `错误: ${e}`
            }
        };

        let lang = localStorage.getItem('mecharm_lang') || 'en';

        function applyLang() {
            const t = i18n[lang];
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.dataset.i18n;
                if (t[key]) el.textContent = t[key];
            });
            document.querySelector('.lang-toggle').textContent = t.toggleLabel;
            document.title = lang === 'en' ? 'MechArm Control' : 'MechArm 完整控制';
        }

        function toggleLang() {
            lang = lang === 'en' ? 'zh' : 'en';
            localStorage.setItem('mecharm_lang', lang);
            applyLang();
        }

        function t(key) { return i18n[lang][key]; }

        // Throttle: collect slider changes, send latest every 60ms
        let pendingJoints = {};
        let jointTimer = null;

        function flushJoints() {
            let joints = pendingJoints;
            pendingJoints = {};
            jointTimer = null;
            fetch('/update', {method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({joints:joints, lang:lang})})
            .then(r=>r.json()).then(d=>document.getElementById('st').textContent=d.m);
        }

        for(let i=1; i<=6; i++) {
            document.getElementById('j'+i).oninput = function() {
                let a = parseInt(this.value);
                document.getElementById('v'+i).textContent = a+'°';
                pendingJoints[i] = a;
                if (!jointTimer) jointTimer = setTimeout(flushJoints, 40);
            }
        }

        let gripTimer = null;
        document.getElementById('gripper').oninput = function() {
            let v = parseInt(this.value);
            document.getElementById('vg').textContent = v+'%';
            if (gripTimer) clearTimeout(gripTimer);
            gripTimer = setTimeout(() => {
                gripTimer = null;
                fetch('/gripper', {method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({value:v, lang:lang})})
                .then(r=>r.json()).then(d=>document.getElementById('st').textContent=d.m);
            }, 40);
        }

        function openGripper() {
            document.getElementById('gripper').value = 0;
            document.getElementById('vg').textContent = '0%';
            fetch('/gripper', {method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({value:0, lang:lang})})
            .then(r=>r.json()).then(d=>document.getElementById('st').textContent=d.m);
        }

        function closeGripper() {
            document.getElementById('gripper').value = 100;
            document.getElementById('vg').textContent = '100%';
            fetch('/gripper', {method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({value:100, lang:lang})})
            .then(r=>r.json()).then(d=>document.getElementById('st').textContent=d.m);
        }

        function reset() {
            for(let i=1;i<=6;i++){
                document.getElementById('j'+i).value=0;
                document.getElementById('v'+i).textContent='0°';
            }
            document.getElementById('gripper').value=0;
            document.getElementById('vg').textContent='0%';
            fetch('/reset', {method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({lang:lang})}).then(r=>r.json())
                .then(d=>document.getElementById('st').textContent=d.m);
        }

        function sync() {
            fetch('/sync').then(r=>r.json()).then(d=>{
                if(d.a) {
                    for(let i=0;i<6;i++){
                        let v=Math.round(d.a[i]);
                        document.getElementById('j'+(i+1)).value=v;
                        document.getElementById('v'+(i+1)).textContent=v+'°';
                    }
                }
                if(d.g !== undefined) {
                    document.getElementById('gripper').value=d.g;
                    document.getElementById('vg').textContent=d.g+'%';
                }
                document.getElementById('st').textContent=t('synced');
            });
        }

        window.onload = function() { applyLang(); sync(); };
        setInterval(sync, 30000);
    </script>
</body>
</html>'''

def init():
    global mc, camera, current_angles, gripper_value
    print("初始化机械臂...")
    mc = MechArm270('/dev/ttyAMA0', 1000000)
    mc.set_fresh_mode(1)
    time.sleep(0.1)

    print("初始化摄像头...")
    camera = cv2.VideoCapture(0)
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 480)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 360)
    camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    try:
        current_angles = mc.get_angles()
        print(f"当前角度: {current_angles}")
    except:
        current_angles = [0, 0, 0, 0, 0, 0]
    
    try:
        gripper_value = mc.get_gripper_value()
        print(f"夹具状态: {gripper_value}%")
    except:
        gripper_value = 0
    
    print("✅ 初始化完成")

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/update', methods=['POST'])
def update():
    global current_angles, _target_angles
    d = request.json
    joints = d.get('joints', {})
    # Support batch joint updates from throttled frontend
    for j_str, a in joints.items():
        current_angles[int(j_str)-1] = a
    with _cmd_lock:
        _target_angles = list(current_angles)
    last_j = list(joints.keys())[-1] if joints else '?'
    last_a = joints.get(last_j, '')
    return jsonify({'m': f"J{last_j} → {last_a}°"})

@app.route('/gripper', methods=['POST'])
def gripper():
    global gripper_value, _target_gripper
    d = request.json
    lang = d.get('lang', 'en')
    gripper_value = d['value']
    with _cmd_lock:
        _target_gripper = gripper_value
    if lang == 'zh':
        status = "张开" if gripper_value < 50 else "闭合"
        return jsonify({'m': f"夹具 {status} → {gripper_value}%"})
    else:
        status = "Open" if gripper_value < 50 else "Close"
        return jsonify({'m': f"Gripper {status} → {gripper_value}%"})

@app.route('/reset', methods=['POST'])
def reset():
    global current_angles, gripper_value, _target_angles, _target_gripper
    d = request.json or {}
    lang = d.get('lang', 'en')
    current_angles = [0]*6
    gripper_value = 0
    with _cmd_lock:
        _target_angles = [0]*6
        _target_gripper = 0
    msg = '✅ 全部归零' if lang == 'zh' else '✅ All Reset'
    return jsonify({'m': msg})

@app.route('/sync')
def sync():
    with _serial_lock:
        try:
            angles = mc.get_angles()
            grip = mc.get_gripper_value()
            return jsonify({'a': angles, 'g': grip})
        except:
            return jsonify({'a': current_angles, 'g': gripper_value})

def gen():
    frame_interval = 1.0 / 12  # 12 fps cap
    while True:
        t0 = time.monotonic()
        if camera:
            ret, frame = camera.read()
            if ret:
                y = 30
                for i, a in enumerate(current_angles):
                    cv2.putText(frame, f"J{i+1}:{a:.1f}", (10,y),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)
                    y += 25
                cv2.putText(frame, f"Gripper:{gripper_value}%", (10,y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,0), 2)

                ret, jpg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
                if ret:
                    yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpg.tobytes() + b'\r\n')
        elapsed = time.monotonic() - t0
        if elapsed < frame_interval:
            time.sleep(frame_interval - elapsed)

@app.route('/video')
def video():
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("="*50)
    print("MechArm Control System")
    print("="*50)
    init()
    t = threading.Thread(target=command_loop, daemon=True)
    t.start()
    print("Command loop started (25ms cycle)")
    print(f"\nBrowser: http://192.168.3.2:8080")
    print("="*50)
    app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)

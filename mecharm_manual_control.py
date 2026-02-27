from pymycobot import MechArm270
import cv2
import time
from flask import Flask, Response, render_template_string, request, jsonify

app = Flask(__name__)
camera = None
mc = None
current_angles = [0, 0, 0, 0, 0, 0]

HTML = '''<!DOCTYPE html>
<html>
<head>
    <title>MechArm 手动控制</title>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1a1a; color: #0f0; font-family: monospace; overflow: hidden; }
        .container { display: grid; grid-template-columns: 1fr 400px; height: 100vh; }
        .video-panel { background: #000; display: flex; flex-direction: column; border-right: 2px solid #0f0; }
        .video-header { background: #0f0; color: #000; padding: 15px; font-size: 20px; font-weight: bold; text-align: center; }
        .video-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; }
        #video { max-width: 100%; max-height: 100%; border: 2px solid #0f0; }
        .control-panel { background: #111; padding: 20px; overflow-y: auto; }
        .header { background: #0f0; color: #000; padding: 15px; margin: -20px -20px 20px -20px; text-align: center; font-size: 18px; font-weight: bold; }
        .joint-control { background: #222; border: 2px solid #0f0; border-radius: 5px; padding: 15px; margin-bottom: 15px; }
        .joint-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 16px; font-weight: bold; }
        .joint-value { color: #ff0; font-size: 18px; min-width: 60px; text-align: right; }
        .slider { width: 100%; height: 8px; border-radius: 5px; background: #333; outline: none; -webkit-appearance: none; }
        .slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #0f0; cursor: pointer; box-shadow: 0 0 10px #0f0; }
        .range-labels { display: flex; justify-content: space-between; font-size: 12px; color: #888; margin-top: 5px; }
        .btn { background: #0f0; color: #000; border: none; padding: 12px; font-size: 14px; font-weight: bold; cursor: pointer; border-radius: 5px; margin: 5px; }
        .btn:hover { background: #0c0; }
        .status { background: #000; border: 2px solid #0f0; padding: 10px; margin-top: 20px; border-radius: 5px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="video-panel">
            <div class="video-header">📹 实时视频</div>
            <div class="video-container">
                <img id="video" src="/video">
            </div>
        </div>
        <div class="control-panel">
            <div class="header">🎮 6轴控制</div>
            <div class="joint-control">
                <div class="joint-header"><span>关节 1 (底座)</span><span class="joint-value" id="v1">0°</span></div>
                <input type="range" class="slider" id="j1" min="-160" max="160" value="0">
                <div class="range-labels"><span>-160°</span><span>+160°</span></div>
            </div>
            <div class="joint-control">
                <div class="joint-header"><span>关节 2</span><span class="joint-value" id="v2">0°</span></div>
                <input type="range" class="slider" id="j2" min="-90" max="90" value="0">
                <div class="range-labels"><span>-90°</span><span>+90°</span></div>
            </div>
            <div class="joint-control">
                <div class="joint-header"><span>关节 3</span><span class="joint-value" id="v3">0°</span></div>
                <input type="range" class="slider" id="j3" min="-180" max="45" value="0">
                <div class="range-labels"><span>-180°</span><span>+45°</span></div>
            </div>
            <div class="joint-control">
                <div class="joint-header"><span>关节 4</span><span class="joint-value" id="v4">0°</span></div>
                <input type="range" class="slider" id="j4" min="-160" max="160" value="0">
                <div class="range-labels"><span>-160°</span><span>+160°</span></div>
            </div>
            <div class="joint-control">
                <div class="joint-header"><span>关节 5</span><span class="joint-value" id="v5">0°</span></div>
                <input type="range" class="slider" id="j5" min="-100" max="100" value="0">
                <div class="range-labels"><span>-100°</span><span>+100°</span></div>
            </div>
            <div class="joint-control">
                <div class="joint-header"><span>关节 6 (末端)</span><span class="joint-value" id="v6">0°</span></div>
                <input type="range" class="slider" id="j6" min="-180" max="180" value="0">
                <div class="range-labels"><span>-180°</span><span>+180°</span></div>
            </div>
            <button class="btn" onclick="reset()">🏠 归零</button>
            <button class="btn" onclick="sync()">📍 同步角度</button>
            <div class="status" id="st">就绪</div>
        </div>
    </div>
    <script>
        for(let i=1; i<=6; i++) {
            document.getElementById('j'+i).oninput = function() {
                let a = this.value;
                document.getElementById('v'+i).textContent = a+'°';
                fetch('/update', {method:'POST', headers:{'Content-Type':'application/json'}, 
                    body:JSON.stringify({j:i, a:parseInt(a)})})
                .then(r=>r.json()).then(d=>document.getElementById('st').textContent=d.m);
            }
        }
        function reset() {
            fetch('/reset', {method:'POST'}).then(r=>r.json()).then(d=>{
                for(let i=1;i<=6;i++){document.getElementById('j'+i).value=0; document.getElementById('v'+i).textContent='0°';}
                document.getElementById('st').textContent=d.m;
            });
        }
        function sync() {
            fetch('/sync').then(r=>r.json()).then(d=>{
                if(d.a) for(let i=0;i<6;i++){
                    let v=Math.round(d.a[i]);
                    document.getElementById('j'+(i+1)).value=v;
                    document.getElementById('v'+(i+1)).textContent=v+'°';
                }
                document.getElementById('st').textContent='✅ 已同步';
            });
        }
        window.onload = sync;
        setInterval(sync, 5000);
    </script>
</body>
</html>'''

def init():
    global mc, camera, current_angles
    print("初始化...")
    mc = MechArm270('/dev/ttyAMA0', 1000000)
    camera = cv2.VideoCapture(0)
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    try:
        current_angles = mc.get_angles()
    except:
        current_angles = [0, 0, 0, 0, 0, 0]
    print("✅ 完成")

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/update', methods=['POST'])
def update():
    global current_angles
    d = request.json
    current_angles[d['j']-1] = d['a']
    try:
        mc.send_angles(current_angles, 50)
        return jsonify({'m': f"J{d['j']} → {d['a']}°"})
    except Exception as e:
        return jsonify({'m': f"错误: {e}"})

@app.route('/reset', methods=['POST'])
def reset():
    global current_angles
    current_angles = [0]*6
    mc.send_angles(current_angles, 30)
    return jsonify({'m': '✅ 已归零'})

@app.route('/sync')
def sync():
    try:
        return jsonify({'a': mc.get_angles()})
    except:
        return jsonify({'a': current_angles})

def gen():
    while True:
        if camera:
            ret, frame = camera.read()
            if ret:
                y = 30
                for i, a in enumerate(current_angles):
                    cv2.putText(frame, f"J{i+1}:{a:.1f}", (10,y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)
                    y += 25
                ret, jpg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpg.tobytes() + b'\r\n')

@app.route('/video')
def video():
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("="*50)
    print("MechArm 手动控制")
    print("="*50)
    init()
    print("\n浏览器: http://192.168.2.2:6000")
    print("="*50)
    app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)



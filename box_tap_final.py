from pymycobot import MechArm270
import cv2
import numpy as np
import time
import threading
from flask import Flask, Response, render_template_string

app = Flask(__name__)

# 全局变量
camera = None
mc = None
status_message = "准备就绪"
task_running = False

HTML = '''
<!DOCTYPE html>
<html>
<head>
    <title>红盒子点击任务</title>
    <meta http-equiv="Cache-Control" content="no-cache">
    <style>
        body { background: #1a1a1a; color: #0f0; font-family: 'Courier New', monospace; text-align: center; padding: 20px; margin: 0; }
        h1 { color: #0f0; text-shadow: 0 0 10px #0f0; margin: 20px 0; }
        .container { max-width: 1200px; margin: 0 auto; }
        .status { background: #000; border: 2px solid #0f0; padding: 20px; margin: 20px 0; font-size: 20px; min-height: 40px; border-radius: 5px; }
        .video-container { background: #000; padding: 10px; border: 2px solid #0f0; border-radius: 5px; margin: 20px 0; }
        img { max-width: 100%; height: auto; display: block; margin: 0 auto; border: 1px solid #0f0; }
        .button { background: #0f0; color: #000; border: none; padding: 15px 40px; font-size: 20px; font-weight: bold; cursor: pointer; margin: 10px; font-family: 'Courier New', monospace; border-radius: 5px; transition: all 0.3s; }
        .button:hover { background: #0c0; transform: scale(1.05); }
        .button:disabled { background: #555; cursor: not-allowed; transform: scale(1); }
        .info { background: #222; padding: 15px; margin: 15px 0; border-left: 4px solid #0f0; text-align: left; border-radius: 3px; }
        .info h3 { margin-top: 0; color: #0f0; }
        .info p { margin: 8px 0; line-height: 1.6; }
        .blink { animation: blink 1s linear infinite; }
        @keyframes blink { 50% { opacity: 0.5; } }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 MechArm 红盒子点击任务</h1>
        <div class="status" id="status">初始化中...</div>
        <button class="button" id="startBtn" onclick="startTask()">▶️ 开始任务</button>
        <div class="grid">
            <div class="info">
                <h3>📋 任务流程</h3>
                <p>1️⃣ 机械臂旋转扫描周围环境</p>
                <p>2️⃣ 识别红色盒子位置</p>
                <p>3️⃣ 移动到盒子位置</p>
                <p>4️⃣ 轻轻点击红色盒子</p>
                <p>5️⃣ 返回初始位置</p>
            </div>
            <div class="info">
                <h3>✅ 使用提示</h3>
                <p>• 红色盒子距离约20-25cm</p>
                <p>• 保持充足光线</p>
                <p>• 盒子颜色要鲜艳</p>
                <p>• 避免其他红色物体干扰</p>
            </div>
        </div>
        <div class="video-container">
            <h2>📹 实时视频监控</h2>
            <img src="/video" id="video" alt="加载中...">
            <p style="color: #888; font-size: 14px; margin-top: 10px;">绿框 = 检测到的红色物体 | 红点 = 物体中心</p>
        </div>
    </div>
    <script>
        let taskRunning = false;
        function startTask() {
            if (taskRunning) { alert('⚠️ 任务运行中...'); return; }
            if (!confirm('确认开始任务？\\n\\n✅ 红色盒子已放置好\\n✅ 周围无障碍物')) return;
            taskRunning = true;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('startBtn').innerText = '⏳ 运行中...';
            fetch('/start_task').then(r => r.json()).then(d => console.log(d.message));
        }
        function resetButton() { taskRunning = false; document.getElementById('startBtn').disabled = false; document.getElementById('startBtn').innerText = '▶️ 开始任务'; }
        setInterval(() => {
            fetch('/status').then(r => r.json()).then(d => {
                document.getElementById('status').innerHTML = d.status;
                if (d.status.includes('完成') || d.status.includes('未找到') || d.status.includes('就绪') || d.status.includes('错误')) {
                    if (taskRunning) { resetButton(); if (d.status.includes('完成')) setTimeout(() => alert('✅ 完成！'), 500); }
                }
                document.getElementById('status').classList.toggle('blink', 
                    d.status.includes('扫描') || d.status.includes('点击') || d.status.includes('移动'));
            });
        }, 1000);
        setTimeout(() => fetch('/status').then(r => r.json()).then(d => document.getElementById('status').innerHTML = d.status), 500);
    </script>
</body>
</html>
'''

class BoxTapper:
    def __init__(self):
        global mc, camera, status_message
        
        status_message = "⚙️ 初始化中..."
        print("初始化机械臂...")
        mc = MechArm270('/dev/ttyAMA0', 1000000)
        
        print("初始化摄像头...")
        camera = cv2.VideoCapture(0)
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        self.home_position = [0, -45, 45, 0, 90, 0]
        
        status_message = "🏠 移动到初始位置..."
        mc.send_angles(self.home_position, 30)
        time.sleep(3)
        
        status_message = "✅ 就绪 - 点击开始任务"
        print("✅ 初始化完成")
        
    def detect_red_box(self, frame):
        """检测红色盒子"""
        try:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            
            lower_red1 = np.array([0, 100, 100])
            upper_red1 = np.array([10, 255, 255])
            lower_red2 = np.array([160, 100, 100])
            upper_red2 = np.array([180, 255, 255])
            
            mask = cv2.inRange(hsv, lower_red1, upper_red1) + cv2.inRange(hsv, lower_red2, upper_red2)
            
            kernel = np.ones((5,5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if contours:
                largest = max(contours, key=cv2.contourArea)
                area = cv2.contourArea(largest)
                
                if area > 2000:
                    M = cv2.moments(largest)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        
                        cv2.drawContours(frame, [largest], -1, (0, 255, 0), 3)
                        cv2.circle(frame, (cx, cy), 8, (0, 0, 255), -1)
                        cv2.putText(frame, f"RED BOX ({cx},{cy})", (cx-80, cy-25),
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                        
                        return (cx, cy), area
        except:
            pass
        
        return None, None
    
    def scan_for_box(self):
        """扫描寻找红色盒子"""
        global status_message
        
        status_message = "🔍 开始扫描..."
        print(status_message)
        
        scan_angles = [-60, -30, 0, 30, 60]
        
        for i, angle in enumerate(scan_angles):
            status_message = f"🔄 扫描 ({i+1}/5) 角度:{angle}°"
            print(status_message)
            
            mc.send_angles([angle, -45, 45, 0, 90, 0], 30)
            time.sleep(2)
            
            for _ in range(3):
                ret, frame = camera.read()
                if ret:
                    position, area = self.detect_red_box(frame)
                    if position:
                        status_message = f"✅ 发现！角度:{angle}° 位置:{position}"
                        print(status_message)
                        return angle, position
                time.sleep(0.3)
        
        status_message = "❌ 未找到红色盒子"
        return None, None
    
    def tap_box(self, base_angle, image_position):
        """点击盒子"""
        global status_message
        
        cx, cy = image_position
        offset_x = (cx - 320) / 320.0
        adjusted_angle = base_angle + offset_x * 15
        
        status_message = "🎯 对准..."
        mc.send_angles([adjusted_angle, -45, 45, 0, 90, 0], 20)
        time.sleep(2)
        
        status_message = "➡️ 伸出..."
        mc.send_angles([adjusted_angle, -30, 30, 0, 60, 0], 20)
        time.sleep(2)
        
        status_message = "⬇️ 下降..."
        mc.send_angles([adjusted_angle, -20, 20, 0, 40, 0], 15)
        time.sleep(2)
        
        status_message = "👆 轻点！"
        mc.send_angles([adjusted_angle, -15, 15, 0, 30, 0], 10)
        time.sleep(1.5)
        
        status_message = "⬆️ 收回..."
        mc.send_angles(self.home_position, 30)
        time.sleep(3)
    
    def run(self):
        """执行任务"""
        global status_message, task_running
        
        task_running = True
        
        try:
            print("\n" + "="*50)
            print("开始任务")
            print("="*50)
            
            base_angle, position = self.scan_for_box()
            
            if position:
                self.tap_box(base_angle, position)
                status_message = "✅ 任务完成！"
            else:
                status_message = "❌ 未找到红色盒子"
            
            mc.send_angles(self.home_position, 30)
            time.sleep(2)
            
        except Exception as e:
            status_message = f"❌ 错误: {str(e)}"
            try:
                mc.send_angles(self.home_position, 30)
            except:
                pass
        finally:
            task_running = False

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/status')
def get_status():
    return {'status': status_message}

@app.route('/start_task')
def start_task():
    if not task_running:
        threading.Thread(target=bot.run, daemon=True).start()
        return {'message': '任务已启动'}
    return {'message': '任务运行中'}

def generate_video():
    """视频流生成器 - 使用测试成功的方式"""
    print("视频流启动")
    
    while True:
        if camera is None:
            time.sleep(0.1)
            continue
            
        ret, frame = camera.read()
        if not ret:
            continue
        
        # 检测红色盒子并标注
        bot.detect_red_box(frame)
        
        # 添加状态文字
        cv2.putText(frame, status_message[:50], (10, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        # 编码
        ret, jpeg = cv2.imencode('.jpg', frame)
        if not ret:
            continue
            
        frame_bytes = jpeg.tobytes()
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + 
               frame_bytes + b'\r\n')

@app.route('/video')
def video():
    return Response(generate_video(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("="*60)
    print("MechArm 红盒子点击系统")
    print("="*60)
    
    bot = BoxTapper()
    
    print("\n浏览器打开: http://192.168.2.2:5000")
    print("按 Ctrl+C 停止")
    print("="*60 + "\n")
    
    try:
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    except KeyboardInterrupt:
        if camera:
            camera.release()

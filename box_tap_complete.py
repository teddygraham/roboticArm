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

# ... [HTML 代码保持不变，这里省略] ...
HTML = '''
<!DOCTYPE html>
<html>
<head>
    <title>红盒子点击任务</title>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <style>
        body { background: #1a1a1a; color: #0f0; font-family: 'Courier New', monospace; text-align: center; padding: 20px; margin: 0; }
        h1 { color: #0f0; text-shadow: 0 0 10px #0f0; margin: 20px 0; }
        .container { max-width: 1200px; margin: 0 auto; }
        .status { background: #000; border: 2px solid #0f0; padding: 20px; margin: 20px 0; font-size: 20px; min-height: 40px; border-radius: 5px; }
        .video-container { background: #000; padding: 10px; border: 2px solid #0f0; border-radius: 5px; margin: 20px 0; }
        img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
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
                <p>• 确保红色盒子在工作范围内（约20-25cm）</p>
                <p>• 保持充足光线</p>
                <p>• 盒子颜色要鲜艳</p>
                <p>• 避免其他红色物体干扰</p>
            </div>
        </div>
        <div class="video-container">
            <h2>📹 实时视频监控</h2>
            <img src="/video" id="video" alt="视频加载中...">
            <p style="color: #888; font-size: 14px; margin-top: 10px;">绿框 = 检测到的红色物体 | 红点 = 物体中心</p>
        </div>
    </div>
    <script>
        let taskRunning = false;
        function startTask() {
            if (taskRunning) { alert('⚠️ 任务正在运行中，请等待完成...'); return; }
            if (!confirm('确认开始任务吗？\\n\\n请确保：\\n✅ 红色盒子已放置好\\n✅ 机械臂周围无障碍物')) { return; }
            taskRunning = true;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('startBtn').innerText = '⏳ 任务运行中...';
            fetch('/start_task').then(response => response.json()).then(data => console.log('✅ ' + data.message)).catch(error => { console.error('❌ Error:', error); alert('启动任务失败，请重试'); resetButton(); });
        }
        function resetButton() { taskRunning = false; document.getElementById('startBtn').disabled = false; document.getElementById('startBtn').innerText = '▶️ 开始任务'; }
        setInterval(() => {
            fetch('/status').then(response => response.json()).then(data => {
                const statusDiv = document.getElementById('status');
                statusDiv.innerHTML = data.status;
                if (data.status.includes('完成') || data.status.includes('未找到') || data.status.includes('就绪') || data.status.includes('错误')) {
                    if (taskRunning) { resetButton(); if (data.status.includes('完成')) { setTimeout(() => alert('✅ 任务完成！'), 500); } }
                }
                if (data.status.includes('扫描') || data.status.includes('点击') || data.status.includes('移动') || data.status.includes('对准') || data.status.includes('伸出') || data.status.includes('下降') || data.status.includes('收回')) {
                    statusDiv.classList.add('blink');
                } else { statusDiv.classList.remove('blink'); }
            }).catch(error => console.error('状态更新错误:', error));
        }, 1000);
        window.addEventListener('load', function() {
            setTimeout(() => { fetch('/status').then(response => response.json()).then(data => document.getElementById('status').innerHTML = data.status); }, 500);
        });
        window.addEventListener('beforeunload', function(e) {
            if (taskRunning) { e.preventDefault(); e.returnValue = '任务正在运行，确定要离开吗？'; return e.returnValue; }
        });
    </script>
</body>
</html>
'''

class BoxTapper:
    def __init__(self):
        global mc, camera, status_message
        
        print("初始化机械臂...")
        status_message = "⚙️ 初始化机械臂..."
        
        mc = MechArm270('/dev/ttyAMA0', 1000000)
        
        print("初始化摄像头...")
        camera = cv2.VideoCapture(0)
        if not camera.isOpened():
            print("❌ 错误：无法打开摄像头")
            status_message = "❌ 错误：摄像头无法打开"
            return
            
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # 减少缓冲
        
        # 测试读取一帧
        ret, test_frame = camera.read()
        if ret:
            print(f"✓ 摄像头测试成功，分辨率: {test_frame.shape}")
        else:
            print("❌ 摄像头无法读取帧")
        
        self.home_position = [0, -45, 45, 0, 90, 0]
        
        status_message = "🏠 移动到初始位置..."
        print(status_message)
        mc.send_angles(self.home_position, 30)
        time.sleep(3)
        
        status_message = "✅ 就绪 - 点击开始任务按钮"
        print("✅ 初始化完成")
        
    def detect_red_box(self, frame):
        """检测红色盒子"""
        try:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            
            lower_red1 = np.array([0, 100, 100])
            upper_red1 = np.array([10, 255, 255])
            lower_red2 = np.array([160, 100, 100])
            upper_red2 = np.array([180, 255, 255])
            
            mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
            mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
            mask = mask1 + mask2
            
            kernel = np.ones((5,5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if contours:
                largest_contour = max(contours, key=cv2.contourArea)
                area = cv2.contourArea(largest_contour)
                
                if area > 2000:
                    M = cv2.moments(largest_contour)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        
                        cv2.drawContours(frame, [largest_contour], -1, (0, 255, 0), 3)
                        cv2.circle(frame, (cx, cy), 8, (0, 0, 255), -1)
                        cv2.putText(frame, f"RED BOX", (cx-60, cy-25),
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
                        cv2.putText(frame, f"({cx},{cy})", (cx-40, cy+25),
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                        
                        return (cx, cy), area, frame
        except Exception as e:
            print(f"检测错误: {e}")
        
        return None, None, frame
    
    def scan_for_box(self):
        """扫描寻找红色盒子"""
        global status_message
        
        status_message = "🔍 开始扫描周围环境..."
        print("\n" + status_message)
        
        scan_angles = [-60, -30, 0, 30, 60]
        
        for i, angle in enumerate(scan_angles):
            status_message = f"🔄 扫描中 ({i+1}/5) - 角度: {angle}°"
            print(status_message)
            
            scan_position = [angle, -45, 45, 0, 90, 0]
            mc.send_angles(scan_position, 30)
            time.sleep(2)
            
            for _ in range(3):
                ret, frame = camera.read()
                if ret:
                    position, area, _ = self.detect_red_box(frame)
                    if position:
                        status_message = f"✅ 发现红色盒子！角度:{angle}° 位置:{position} 面积:{int(area)}"
                        print(status_message)
                        time.sleep(1)
                        return angle, position
                time.sleep(0.3)
        
        status_message = "❌ 扫描完成 - 未找到红色盒子"
        print(status_message)
        return None, None
    
    def tap_box(self, base_angle, image_position):
        """点击盒子"""
        global status_message
        
        print("\n准备点击红色盒子...")
        
        cx, cy = image_position
        offset_x = (cx - 320) / 320.0
        adjusted_angle = base_angle + offset_x * 15
        
        status_message = "🎯 对准盒子..."
        print(status_message)
        align_position = [adjusted_angle, -45, 45, 0, 90, 0]
        mc.send_angles(align_position, 20)
        time.sleep(2)
        
        status_message = "➡️ 伸出手臂..."
        print(status_message)
        reach_position = [adjusted_angle, -30, 30, 0, 60, 0]
        mc.send_angles(reach_position, 20)
        time.sleep(2)
        
        status_message = "⬇️ 下降接近..."
        print(status_message)
        down_position = [adjusted_angle, -20, 20, 0, 40, 0]
        mc.send_angles(down_position, 15)
        time.sleep(2)
        
        status_message = "👆 轻点盒子！"
        print(status_message)
        tap_position = [adjusted_angle, -15, 15, 0, 30, 0]
        mc.send_angles(tap_position, 10)
        time.sleep(1.5)
        
        status_message = "⬆️ 收回手臂..."
        print(status_message)
        mc.send_angles(self.home_position, 30)
        time.sleep(3)
    
    def run(self):
        """执行完整任务"""
        global status_message, task_running
        
        task_running = True
        
        try:
            print("\n" + "="*50)
            print("🚀 开始执行任务")
            print("="*50)
            
            base_angle, position = self.scan_for_box()
            
            if position:
                self.tap_box(base_angle, position)
                status_message = "✅ 任务完成！已成功点击红色盒子"
                print("\n" + status_message)
            else:
                status_message = "❌ 未找到红色盒子 - 请检查位置和光线"
                print("\n" + status_message)
            
            print("返回初始位置...")
            mc.send_angles(self.home_position, 30)
            time.sleep(2)
            
        except Exception as e:
            status_message = f"❌ 错误: {str(e)}"
            print("\n" + status_message)
            try:
                mc.send_angles(self.home_position, 30)
            except:
                pass
        finally:
            task_running = False
            print("任务结束\n")

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/status')
def get_status():
    return {'status': status_message, 'running': task_running}

@app.route('/start_task')
def start_task():
    global task_running
    
    if task_running:
        return {'message': '任务已在运行中，请等待...', 'success': False}
    
    task_thread = threading.Thread(target=bot.run)
    task_thread.daemon = True
    task_thread.start()
    
    return {'message': '任务已启动！请观察视频和状态', 'success': True}

def generate_frames():
    """生成视频流 - 修复版"""
    global camera
    
    print("视频流线程启动")
    
    while True:
        try:
            if camera is None or not camera.isOpened():
                print("摄像头未打开，等待...")
                time.sleep(0.5)
                continue
            
            success, frame = camera.read()
            
            if not success or frame is None:
                print("读取帧失败")
                time.sleep(0.1)
                continue
            
            # 检测并标注
            _, _, annotated_frame = bot.detect_red_box(frame)
            
            # 添加状态文字
            status_text = status_message[:60] if status_message else "运行中"
            cv2.putText(annotated_frame, status_text, (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            # 编码为 JPEG
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 80]
            ret, buffer = cv2.imencode('.jpg', annotated_frame, encode_param)
            
            if not ret:
                print("编码失败")
                continue
            
            frame_bytes = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n'
                   b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n'
                   b'\r\n' + frame_bytes + b'\r\n')
                   
        except GeneratorExit:
            print("视频流客户端断开")
            break
        except Exception as e:
            print(f"视频流错误: {e}")
            time.sleep(0.1)

@app.route('/video')
def video():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("="*60)
    print("🚀 MechArm 红盒子点击系统启动")
    print("="*60)
    
    bot = BoxTapper()
    
    print("\n📱 在浏览器打开: http://192.168.2.2:5000")
    print("⌨️  按 Ctrl+C 停止程序")
    print("="*60 + "\n")
    
    try:
        app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\n\n程序终止")
        if camera:
            camera.release()


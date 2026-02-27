from pymycobot import MechArm270
import cv2
import numpy as np
from flask import Flask, Response, render_template_string

app = Flask(__name__)
mc = MechArm270('/dev/ttyAMA0', 1000000)
camera = cv2.VideoCapture(0)

HTML = '''
<!DOCTYPE html>
<html>
<head>
    <title>MechArm Visual System</title>
    <style>
        body { background: #000; color: #0f0; text-align: center; font-family: monospace; }
        img { max-width: 90%; border: 2px solid #0f0; margin: 20px; }
        .info { background: #111; padding: 10px; display: inline-block; margin: 10px; }
    </style>
</head>
<body>
    <h1>🤖 MechArm Pi 270 Visual System</h1>
    <div class="info">
        <h3>Introduce</h3>
        <p>✅ Green frame = Detected red object</p>
        <p>🔴 Red dot = Center of the object</p>
        <p>Try to show your red objects！</p>
    </div>
    <img src="/video">
</body>
</html>
'''

def generate_frames():
    while True:
        success, frame = camera.read()
        if not success:
            break
        
        # 红色物体检测
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask1 = cv2.inRange(hsv, np.array([0, 100, 100]), np.array([10, 255, 255]))
        mask2 = cv2.inRange(hsv, np.array([160, 100, 100]), np.array([180, 255, 255]))
        mask = mask1 + mask2
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # 标注检测结果
        for contour in contours:
            if cv2.contourArea(contour) > 500:
                x, y, w, h = cv2.boundingRect(contour)
                M = cv2.moments(contour)
                if M["m00"] > 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                    cv2.circle(frame, (cx, cy), 5, (0, 0, 255), -1)
                    cv2.putText(frame, f"({cx},{cy})", (x, y-10), 
                              cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        ret, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/')
def index():
    return HTML

@app.route('/video')
def video():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("=" * 50)
    print("🚀 MechArm 视觉系统启动")
    print("=" * 50)
    print("在浏览器打开: http://192.168.2.2:5000")
    print("按 Ctrl+C 停止")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)

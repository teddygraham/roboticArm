import cv2
from flask import Flask, Response

app = Flask(__name__)

def gen():
    camera = cv2.VideoCapture(0)
    print("摄像头已打开")
    
    frame_count = 0
    while True:
        ret, frame = camera.read()
        if not ret:
            print("读取失败")
            continue
            
        frame_count += 1
        if frame_count % 30 == 0:
            print(f"已发送 {frame_count} 帧")
        
        # 画一个测试文字
        cv2.putText(frame, "TEST VIDEO", (50, 50), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        ret, jpeg = cv2.imencode('.jpg', frame)
        frame_bytes = jpeg.tobytes()
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + 
               frame_bytes + b'\r\n')

@app.route('/')
def index():
    return '''
    <html>
    <body style="background: black; color: lime; text-align: center;">
    <h1>测试视频流</h1>
    <img src="/video" style="border: 2px solid lime;">
    </body>
    </html>
    '''

@app.route('/video')
def video():
    print("视频流请求到达")
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    print("启动测试服务器...")
    print("浏览器打开: http://192.168.2.2:8888")
    app.run(host='0.0.0.0', port=8888, debug=True, threaded=True)

from pymycobot import MechArm270
import cv2
import time
import numpy as np

# 初始化
mc = MechArm270('/dev/ttyAMA0', 1000000)
cap = cv2.VideoCapture(0)

print("视觉机械臂控制程序")
print("=" * 40)
print("摄像头实时流: http://192.168.2.2:8080")
print("按 Ctrl+C 停止")
print()

try:
    while True:
        # 读取一帧
        ret, frame = cap.read()
        if ret:
            # 保存当前帧供查看
            cv2.imwrite('/tmp/current_frame.jpg', frame)
            
            # 简单的颜色检测（检测红色物体）
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            lower_red = np.array([0, 100, 100])
            upper_red = np.array([10, 255, 255])
            mask = cv2.inRange(hsv, lower_red, upper_red)
            
            # 找轮廓
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if contours:
                # 找最大轮廓
                largest = max(contours, key=cv2.contourArea)
                if cv2.contourArea(largest) > 500:  # 过滤小噪点
                    M = cv2.moments(largest)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        
                        print(f"检测到红色物体在: ({cx}, {cy})")
                        
                        # 根据物体位置调整机械臂（示例）
                        # 这里可以添加你的控制逻辑
        
        # 获取机械臂状态
        angles = mc.get_angles()
        print(f"关节角度: {[round(a, 1) for a in angles]}")
        
        time.sleep(0.5)

except KeyboardInterrupt:
    print("\n程序结束")
    cap.release()


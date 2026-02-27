from pymycobot import MechArm270
import cv2
import time
import numpy as np

# 初始化
mc = MechArm270('/dev/ttyAMA0', 1000000)
cap = cv2.VideoCapture(0)

print("视觉检测程序（带可视化）")
print("=" * 50)
print("1. 摄像头实时流: http://192.168.2.2:8080")
print("2. 检测结果图片: http://192.168.2.2:8000")
print()
print("拿一个红色物体放在摄像头前测试")
print("按 Ctrl+C 停止")
print("=" * 50)
print()

frame_count = 0

try:
    while True:
        # 读取一帧
        ret, frame = cap.read()
        if not ret:
            continue
        
        # 创建副本用于标注
        display_frame = frame.copy()
        
        # 颜色检测（检测红色物体）
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # 红色在 HSV 中有两个范围
        lower_red1 = np.array([0, 100, 100])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([160, 100, 100])
        upper_red2 = np.array([180, 255, 255])
        
        mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
        mask = mask1 + mask2
        
        # 找轮廓
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        detected = False
        if contours:
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > 500:  # 过滤小噪点
                    detected = True
                    
                    # 获取边界框
                    x, y, w, h = cv2.boundingRect(contour)
                    
                    # 计算中心点
                    M = cv2.moments(contour)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        
                        # 在图片上画框和中心点
                        cv2.rectangle(display_frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                        cv2.circle(display_frame, (cx, cy), 5, (0, 0, 255), -1)
                        
                        # 添加文字标签
                        cv2.putText(display_frame, f"Red Object ({cx},{cy})", 
                                  (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 
                                  0.5, (0, 255, 0), 2)
                        
                        print(f"✓ 检测到红色物体 - 位置:({cx}, {cy}) 面积:{int(area)}")
        
        # 添加状态信息到图片
        status_text = "检测到红色物体!" if detected else "未检测到物体"
        color = (0, 255, 0) if detected else (0, 0, 255)
        cv2.putText(display_frame, status_text, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
        
        # 添加帧计数
        cv2.putText(display_frame, f"Frame: {frame_count}", (10, 460), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        # 保存标注后的图片
        cv2.imwrite('/tmp/detection_result.jpg', display_frame)
        
        # 每 10 帧显示一次机械臂状态
        if frame_count % 10 == 0:
            angles = mc.get_angles()
            print(f"关节角度: {[round(a, 1) for a in angles]}")
        
        frame_count += 1
        time.sleep(0.1)

except KeyboardInterrupt:
    print("\n程序结束")
    cap.release()



from pymycobot import MechArm270
import time

# 连接到机器手臂
mc = MechArm270('/dev/ttyAMA0', 1000000)

print("MechArm Pi 270 控制示例")
print("=" * 40)

# 1. 获取当前位置
print("\n1. 当前关节角度:")
angles = mc.get_angles()
print(f"   {angles}")

# 2. 移动到初始位置（所有关节归零）
print("\n2. 移动到初始位置...")
mc.send_angles([0, 0, 0, 0, 0, 0], 50)  # 速度 50
time.sleep(3)

# 3. 简单动作示例
print("\n3. 执行简单动作...")
mc.send_angles([30, -30, 30, 0, 30, 0], 50)
time.sleep(2)

mc.send_angles([-30, 30, -30, 0, -30, 0], 50)
time.sleep(2)

# 4. 回到初始位置
print("\n4. 返回初始位置...")
mc.send_angles([0, 0, 0, 0, 0, 0], 50)

print("\n✓ 控制演示完成！")


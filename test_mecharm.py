from pymycobot import MechArm270

print("正在连接 MechArm Pi 270...")

try:
    # 连接到机器手臂
    # MechArm Pi 270 使用 /dev/ttyAMA0，波特率 1000000
    mc = MechArm270('/dev/ttyAMA0', 1000000)
    
    print("✓ 连接成功！")
    
    # 测试：获取当前关节角度
    print("\n正在读取关节角度...")
    angles = mc.get_angles()
    print("当前关节角度:", angles)
    
    # 测试：检查是否有电源
    print("\n检查电源状态...")
    is_power_on = mc.is_power_on()
    print("电源状态:", "开启" if is_power_on else "关闭")
    
    print("\n✓ 所有测试完成！MechArm 正常工作。")
    
except Exception as e:
    print("✗ 连接失败:", e)
    print("\n可能的原因：")
    print("1. MechArm 没有通电")
    print("2. 连接线松动")
    print("3. 需要将用户添加到 dialout 组")


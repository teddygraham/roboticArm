"""WiFi management via nmcli for headless Raspberry Pi."""

import re
import subprocess

# nmcli terse mode uses : as delimiter and escapes literal colons as \:
_NMCLI_SPLIT = re.compile(r"(?<!\\):")


def _nmcli_split(line: str) -> list[str]:
    """Split an nmcli terse-mode line on unescaped colons, then unescape."""
    return [f.replace("\\:", ":").replace("\\\\", "\\") for f in _NMCLI_SPLIT.split(line)]


class WiFiManager:
    """Wraps nmcli commands for WiFi scanning, connecting, and status."""

    def _run(self, cmd: list[str], timeout: int = 15) -> subprocess.CompletedProcess:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

    def scan(self) -> list[dict]:
        """Scan for nearby WiFi networks. Returns list of {ssid, signal, secured, active}."""
        result = self._run([
            "nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,ACTIVE",
            "device", "wifi", "list", "--rescan", "yes",
        ])
        if result.returncode != 0:
            return []

        seen: dict[str, dict] = {}
        for line in result.stdout.strip().splitlines():
            parts = _nmcli_split(line)
            if len(parts) < 4:
                continue
            ssid = parts[0].strip()
            if not ssid:
                continue
            signal = int(parts[1]) if parts[1].isdigit() else 0
            secured = parts[2].strip() != ""
            active = parts[3].strip().lower() == "yes"
            # Keep strongest signal per SSID
            if ssid not in seen or signal > seen[ssid]["signal"]:
                seen[ssid] = {
                    "ssid": ssid,
                    "signal": signal,
                    "secured": secured,
                    "active": active,
                }
        return sorted(seen.values(), key=lambda n: n["signal"], reverse=True)

    def connect(self, ssid: str, password: str) -> dict:
        """Connect to a WiFi network. Returns {success, message}."""
        # Delete any stale connection profile for this SSID to avoid
        # "key-mgmt: property is missing" errors on reconnect
        self._run(["sudo", "nmcli", "connection", "delete", ssid])
        result = self._run([
            "sudo", "nmcli", "device", "wifi", "connect", ssid,
            "password", password, "ifname", "wlan0",
        ])
        success = result.returncode == 0
        message = result.stdout.strip() if success else result.stderr.strip()
        return {"success": success, "message": message or ("Connected" if success else "Failed")}

    def disconnect(self) -> dict:
        """Disconnect wlan0. Returns {success, message}."""
        result = self._run(["sudo", "nmcli", "device", "disconnect", "wlan0"])
        success = result.returncode == 0
        message = result.stdout.strip() if success else result.stderr.strip()
        return {"success": success, "message": message or ("Disconnected" if success else "Failed")}

    def status(self) -> dict:
        """Get current WiFi status. Returns {connected, ssid, ip}."""
        # Find active WiFi connection
        result = self._run([
            "nmcli", "-t", "-f", "NAME,DEVICE,TYPE",
            "connection", "show", "--active",
        ])
        ssid = None
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                parts = _nmcli_split(line)
                if len(parts) >= 3 and parts[2].strip() == "802-11-wireless":
                    ssid = parts[0].strip()
                    break

        # Get IP address
        ip_addr = None
        if ssid:
            ip_result = self._run(["ip", "-4", "addr", "show", "wlan0"])
            if ip_result.returncode == 0:
                for line in ip_result.stdout.splitlines():
                    line = line.strip()
                    if line.startswith("inet "):
                        ip_addr = line.split()[1].split("/")[0]
                        break

        return {
            "connected": ssid is not None,
            "ssid": ssid,
            "ip": ip_addr,
        }

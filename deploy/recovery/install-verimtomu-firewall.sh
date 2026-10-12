#!/bin/sh
# Run as root on vps-1423b70e. Restricts only 172.30.41.2 on br-verim-app.
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
cat > /usr/local/sbin/verimtomu-app-firewall <<'FIREWALL'
#!/bin/sh
set -eu
iptables -C INPUT -i br-verim-app -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP 2>/dev/null || iptables -I INPUT 1 -i br-verim-app -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP
iptables -nL DOCKER-USER >/dev/null 2>&1 || iptables -N DOCKER-USER
iptables -C DOCKER-USER -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP
FIREWALL
chmod 0755 /usr/local/sbin/verimtomu-app-firewall
cat > /etc/systemd/system/verimtomu-app-firewall.service <<'UNIT'
[Unit]
Description=Verimtomu private app egress restriction
After=ufw.service
Before=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/verimtomu-app-firewall
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 /etc/systemd/system/verimtomu-app-firewall.service
systemctl daemon-reload
systemctl enable --now verimtomu-app-firewall.service
systemctl is-active verimtomu-app-firewall.service


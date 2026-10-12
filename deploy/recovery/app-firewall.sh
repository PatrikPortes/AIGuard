#!/bin/sh
set -eu
iptables -C INPUT -i br-verim-app -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP 2>/dev/null || iptables -I INPUT 1 -i br-verim-app -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP
iptables -nL DOCKER-USER >/dev/null 2>&1 || iptables -N DOCKER-USER
iptables -C DOCKER-USER -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -s 172.30.41.2/32 -m conntrack --ctstate NEW -j DROP

iptables -C DOCKER-USER -s 172.30.41.2/32 -d 172.30.41.3/32 -p tcp --dport 8080 -j ACCEPT 2>/dev/null || iptables -I DOCKER-USER 1 -s 172.30.41.2/32 -d 172.30.41.3/32 -p tcp --dport 8080 -j ACCEPT

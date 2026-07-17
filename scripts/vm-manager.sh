#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

VM_DIR="/data/vm"
DISK_FILE="$VM_DIR/disk.qcow2"
SCREEN_NAME="vm-console"
SSH_PORT=2222
PANEL_PORT=8080

install_deps() {
    apt update && apt install -y qemu-system-x86 qemu-utils curl genisoimage screen --no-install-recommends
}

create_vm() {
    if [[ -f "$DISK_FILE" ]]; then
        echo -e "${YELLOW}VM already exists.${NC}"
        return 0
    fi
    mkdir -p "$VM_DIR"
    cd "$VM_DIR"

    total_ram=$(free -m | awk '/^Mem:/{print $2}')
    ram_mb=$(( total_ram * 80 / 100 ))
    [[ $ram_mb -lt 2048 ]] && ram_mb=2048
    [[ $ram_mb -gt 8192 ]] && ram_mb=8192
    cpu_cores=$(nproc)
    disk_free=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    disk_size=$(( disk_free * 80 / 100 ))
    [[ $disk_size -lt 20 ]] && disk_size=20
    [[ $disk_size -gt 50 ]] && disk_size=50

    echo -e "   RAM: ${BLUE}${ram_mb}MB${NC}"
    echo -e "   CPU: ${BLUE}${cpu_cores} cores${NC}"
    echo -e "   Disk: ${BLUE}${disk_size}GB${NC}"
    echo "$ram_mb" > config.ram
    echo "$cpu_cores" > config.cpu

    IMAGE_URL="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"
    IMAGE_FILE="ubuntu-jammy-server-cloudimg-amd64.img"
    if [[ ! -f "$IMAGE_FILE" ]]; then
        echo "Downloading Ubuntu 22.04 image..."
        curl -L -o "$IMAGE_FILE.tmp" "$IMAGE_URL"
        mv "$IMAGE_FILE.tmp" "$IMAGE_FILE"
    fi
    qemu-img create -f qcow2 -b "$IMAGE_FILE" -F qcow2 "$DISK_FILE" "${disk_size}G"

    cat > user-data <<USEREOF
#cloud-config
hostname: base-vm
manage_etc_hosts: true
users:
  - name: admin
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    lock_passwd: false
    passwd: \$(echo "admin" | openssl passwd -6 -stdin)
ssh_pwauth: true
chpasswd:
  expire: false
package_update: true
package_upgrade: true
packages:
  - curl
  - wget
  - git
  - htop
  - net-tools
USEREOF
    cat > meta-data <<METAEOF
instance-id: base-vm
local-hostname: base-vm
METAEOF
    genisoimage -output seed.iso -volid cidata -joliet -rock user-data meta-data 2>/dev/null || mkisofs -output seed.iso -volid cidata -joliet -rock user-data meta-data

    echo -e "${GREEN}✅ Plain Ubuntu VM created.${NC}"
    echo -e "${YELLOW}You can later install Pterodactyl or LVM Panel manually inside this VM.${NC}"
}

start_vm() {
    if ! command -v screen &>/dev/null; then install_deps; fi
    if screen -list | grep -q "$SCREEN_NAME"; then
        echo -e "${YELLOW}VM already running. Attaching...${NC}"
        screen -r "$SCREEN_NAME"
        return 0
    fi
    if [[ ! -f "$DISK_FILE" ]]; then
        echo -e "${RED}❌ VM disk not found. Run 'create' first.${NC}"
        return 1
    fi
    cd "$VM_DIR"
    ram_mb=$(cat config.ram 2>/dev/null || echo "2048")
    cpu_cores=$(cat config.cpu 2>/dev/null || echo "2")
    CMD="qemu-system-x86_64 -m ${ram_mb} -smp cores=${cpu_cores}"
    if [[ -e /dev/kvm && -w /dev/kvm ]]; then
        CMD+=" -enable-kvm -cpu host"
        echo -e "${GREEN}✅ KVM acceleration enabled.${NC}"
    else
        echo -e "${YELLOW}⚠️  Using software emulation.${NC}"
    fi
    CMD+=" -drive file=${DISK_FILE},format=qcow2 -cdrom seed.iso -nic user,hostfwd=tcp::${SSH_PORT}-:22,hostfwd=tcp::${PANEL_PORT}-:80 -nographic"
    echo -e "${GREEN}🚀 Starting VM...${NC}"
    echo -e "   SSH: ${BLUE}ssh -p ${SSH_PORT} admin@localhost${NC} (password: admin)"
    echo -e "   Web port forwarded: ${BLUE}localhost:${PANEL_PORT} → VM:80${NC}"
    screen -dmS "$SCREEN_NAME" bash -c "$CMD; exec bash"
    sleep 2
    screen -r "$SCREEN_NAME"
}

stop_vm() {
    if screen -list | grep -q "$SCREEN_NAME"; then
        screen -S "$SCREEN_NAME" -X quit
        echo -e "${GREEN}✅ VM stopped.${NC}"
    else
        echo -e "${YELLOW}VM not running.${NC}"
    fi
}

status_vm() {
    if screen -list | grep -q "$SCREEN_NAME"; then
        echo -e "${GREEN}✅ Running. Attach: screen -r $SCREEN_NAME${NC}"
    else
        echo -e "${RED}❌ Stopped.${NC}"
    fi
}

console_vm() {
    if screen -list | grep -q "$SCREEN_NAME"; then
        screen -r "$SCREEN_NAME"
    else
        echo -e "${RED}❌ VM not running.${NC}"
    fi
}

case "$1" in
    create) create_vm ;;
    start) start_vm ;;
    stop) stop_vm ;;
    status) status_vm ;;
    console) console_vm ;;
    *)
        echo ""
        echo -e "${GREEN}================================================${NC}"
        echo -e "${GREEN}   Plain Ubuntu VM Manager (No Docker)        ${NC}"
        echo -e "${GREEN}================================================${NC}"
        echo "  1) Create VM"
        echo "  2) Start VM (with console)"
        echo "  3) Stop VM"
        echo "  4) Status"
        echo "  5) Attach console"
        echo "  0) Exit"
        read -p "Choice: " choice
        case $choice in
            1) create_vm ;;
            2) start_vm ;;
            3) stop_vm ;;
            4) status_vm ;;
            5) console_vm ;;
            0) exit 0 ;;
            *) echo -e "${RED}Invalid choice.${NC}" ;;
        esac
        ;;
esac

FROM ubuntu:22.04

# Install system dependencies (including QEMU and screen for VM)
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    qemu-system-x86 qemu-utils \
    curl wget git \
    screen genisoimage \
    openssl sudo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

# Ensure the vm-manager.sh is executable and in PATH
COPY scripts/vm-manager.sh /usr/local/bin/vm-manager.sh
RUN chmod +x /usr/local/bin/vm-manager.sh

# Create data directory for VM storage
RUN mkdir -p /data/vm

EXPOSE 5000

CMD ["python3", "app.py"]

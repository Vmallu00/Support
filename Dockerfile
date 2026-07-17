FROM ubuntu:22.04

# Install system dependencies (including QEMU and screen)
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

# Copy all application code
COPY . .

# Copy vm-manager.sh from the root of the repository
COPY vm-manager.sh /usr/local/bin/vm-manager.sh
RUN chmod +x /usr/local/bin/vm-manager.sh

# Create persistent volume mount point
RUN mkdir -p /data/vm

EXPOSE 5000

CMD ["python3", "app.py"]

FROM ubuntu:22.04

# Install system dependencies
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

# This line now looks in the "scripts/" folder (where your file is)
COPY scripts/vm-manager.sh /usr/local/bin/vm-manager.sh
RUN chmod +x /usr/local/bin/vm-manager.sh

RUN mkdir -p /data/vm

EXPOSE 5000

CMD ["python3", "app.py"]

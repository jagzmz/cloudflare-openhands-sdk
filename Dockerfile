FROM docker.io/cloudflare/sandbox:0.6.7

# Install build tools
RUN apt-get update && \
    apt-get install -y make build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install uv and add to PATH
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Clone the repository and build
RUN git clone https://github.com/OpenHands/software-agent-sdk.git && \
    cd software-agent-sdk && \
    make build

# Required during local development to access exposed ports
EXPOSE 8080


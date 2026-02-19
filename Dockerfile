# Use the official Node.js runtime as a parent image
FROM node:24-alpine AS build

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY patches ./

# Upgrade system packages
RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache ca-certificates

# Upgrade npm to version 11.10.0
RUN npm install -g npm@11.10.0

# Change ownership of the working directory to node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Install app dependencies
RUN npm install

# Copy the rest of the application code
COPY --chown=node:node . .

# Build the application and clean up
RUN npm run build \
&& rm -rf node_modules \
&& npm install --omit=dev

# Use the official Node.js runtime as a parent image
FROM node:24-alpine

RUN npm install -g npm@11.10.0

RUN apk add --no-cache ca-certificates

# Set the working directory in the container
WORKDIR /app

# Copy the build directory, node_modules, and package.json to the working directory
COPY --from=build --chown=node:node /app/build /app/build
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/patches /app/patches

# Create entrypoint script that checks SERVER_MODE
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'if [ "$SERVER_MODE" = "mcp" ]; then' >> /app/entrypoint.sh && \
    echo '  exec node build/start-server.js --mcp-node "$@"' >> /app/entrypoint.sh && \
    echo 'elif [ "$SERVER_MODE" = "all" ]; then' >> /app/entrypoint.sh && \
    echo '  exec node build/start-server.js --llm-node --mcp-node "$@"' >> /app/entrypoint.sh && \
    echo 'else' >> /app/entrypoint.sh && \
    echo '  exec npm run start:node "$@"' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    chown node:node /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Switch to non-root user
USER node

# ENV variables
ENV SOURCE_SYNC_API_BASEPATH="https://api.portkey.ai/v1/sync"
ENV CONTROL_PLANE_BASEPATH="https://api.portkey.ai/v1"
ENV ALBUS_BASEPATH="https://albus.portkey.ai"
ENV NODE_ENV="production"
ENV PORT=${PORT:-8787}
ENV MCP_PORT=${MCP_PORT:-8788}
ENV CONFIG_READER_PATH="https://api.portkey.ai/model-configs"
ENV MODEL_CONFIGS_PROXY_FETCH_ENABLED="true"

# Expose the port your app runs on
EXPOSE ${PORT}
EXPOSE ${MCP_PORT}

ENTRYPOINT ["/app/entrypoint.sh"]

# Default command (can be overridden)
CMD []
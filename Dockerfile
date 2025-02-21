# Use the official Node.js runtime as a parent image
FROM node:20-alpine AS build

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Upgrade system packages
RUN apk update && apk upgrade --no-cache

# Upgrade npm to version 10.9.2
RUN npm install -g npm@10.9.2

# Install app dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application and clean up
RUN npm run build \
&& rm -rf node_modules \
&& npm install --omit=dev

# Use the official Node.js runtime as a parent image
FROM node:20-alpine

# Upgrade system packages
RUN apk update && apk upgrade --no-cache

# Upgrade npm to version 10.9.2
RUN npm install -g npm@10.9.2

# Set the working directory in the container
WORKDIR /app

# Copy the build directory, node_modules, and package.json to the working directory
COPY --from=build /app/build /app/build
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json

# Expose port 8787
EXPOSE 8787

ENTRYPOINT ["npm"]
CMD ["run", "start:node"]

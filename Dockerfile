# Use the official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application and clean up
RUN npm run build \
&& rm -rf node_modules \
&& npm install --production

# Expose port 8787
EXPOSE 8787

ENTRYPOINT ["npm"]
CMD ["run", "start:node"]
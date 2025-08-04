# --- Base Stage ---
# Use an official Node.js runtime as a parent image.
# The 'alpine' variant is lightweight and good for production.
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# --- Dependencies ---
# Copy package.json and package-lock.json first.
# This leverages Docker's layer caching. The npm install step will only be
# re-run if these files change, speeding up subsequent builds.
COPY package*.json ./

# Install app dependencies using 'npm ci' which is faster and more reliable
# for production builds as it uses the package-lock.json.
RUN npm ci

# --- Application Code ---
# Copy the rest of the application source code into the container.
# Files listed in .dockerignore will be excluded.
COPY . .

# --- Runtime ---
# The application listens on port 3000, so we expose it.
# This is documentation; the actual port mapping happens in docker-compose.yml.
EXPOSE 3000

# Define the command to run your app
CMD [ "npm", "start" ]

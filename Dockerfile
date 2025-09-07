# Use a newer Puppeteer image to get a compatible Node.js version and security updates
FROM ghcr.io/puppeteer/puppeteer:19.7.2

# --- FIX: REMOVED PUPPETEER_EXECUTABLE_PATH ---
# The official Puppeteer image is pre-configured. The library will find the
# bundled browser automatically without this variable.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /usr/src/app

# Change ownership of the app directory to the non-root 'pptruser'
# This gives npm the permission it needs to write the package-lock.json and node_modules.
RUN chown -R pptruser:pptruser /usr/src/app

# Copy package files
COPY package*.json ./

# Run npm install as the non-root user. This is less strict than 'npm ci'.
RUN npm install

# Copy the rest of the application code
COPY . .

# Command to run the application
CMD [ "node", "index.js" ]
# Frontend Dockerfile for 13Rooms Angular Application
# This creates a development container with live-reload capabilities

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install Angular CLI globally
RUN npm install -g @angular/cli

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
# Note: In docker-compose, this will be overridden by volume mount for live reload
COPY . .

# Expose Angular dev server port
EXPOSE 4200

# Start Angular development server
# --host 0.0.0.0 allows external access to the container
# --poll enables file watching in Docker (required for some systems)
CMD ["ng", "serve", "--host", "0.0.0.0", "--poll", "2000"]

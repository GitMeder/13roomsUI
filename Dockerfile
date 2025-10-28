# Frontend Dockerfile for 13Rooms Angular Application
# Multi-stage build for both development and production

# Stage 1: Base image with common dependencies
FROM node:20-alpine AS base

# Install wget for healthchecks
RUN apk add --no-cache wget

# Set working directory
WORKDIR /app

# Install Angular CLI globally
RUN npm install -g @angular/cli@20

# Copy package files
COPY package*.json ./

# Stage 2: Development build
FROM base AS development

# Install all dependencies (including devDependencies)
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

# Stage 3: Build for production
FROM base AS build

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Angular application
RUN ng build --configuration production

# Stage 4: Production runtime with nginx
FROM nginx:alpine AS production

# Copy custom nginx configuration if needed
# COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application from build stage
COPY --from=build /app/dist/13roomsui/browser /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

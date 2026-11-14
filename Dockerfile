FROM node:20-alpine

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Create data directory
RUN mkdir -p /app/data

EXPOSE 8080

ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

VOLUME ["/app/data"]

CMD ["npm", "start"]

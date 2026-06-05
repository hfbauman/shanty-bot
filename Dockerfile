# Use an official lightweight Node image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of your bot's source code
COPY . .

# Run the bot
CMD ["node", "index.js"]
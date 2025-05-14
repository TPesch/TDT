// Twitch bit donation tracker for girl_dm_
const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Configuration
const CHANNEL_NAME = 'girl_dm_';
const BIT_THRESHOLD_FOR_SPIN = 1000; // Bits needed for a spin
const CSV_PATH = path.join(__dirname, 'bit_donations.csv');
const RECENT_DONATIONS_LIMIT = 10; // Number of recent donations to display

// Get Twitch credentials from environment variables
const TWITCH_USERNAME = process.env.TWITCH_USERNAME || 'justinfan12345'; // Anonymous fallback
const TWITCH_OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || ''; // No auth token for anonymous

// Initialize express app and socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 5000; // Use port 5000 as required

// Initialize CSV file if it doesn't exist
function initializeCSV() {
  if (!fs.existsSync(CSV_PATH)) {
    const header = 'Timestamp,Username,Bits,Message,SpinTriggered\n';
    fs.writeFileSync(CSV_PATH, header);
    console.log('CSV file created successfully!');
  }
}

// Record donation to CSV
function recordDonation(username, bits, message, spinTriggered) {
  const timestamp = new Date().toISOString();
  // Escape any commas in the message to maintain CSV format
  const escapedMessage = message.replace(/,/g, ';').replace(/"/g, '""');
  const newRow = `${timestamp},"${username}",${bits},"${escapedMessage}",${spinTriggered ? 'YES' : 'NO'}\n`;
  
  fs.appendFileSync(CSV_PATH, newRow);
  console.log(`Recorded ${bits} bit donation from ${username}`);
  
  // Send real-time update to connected clients
  const donationData = {
    timestamp: timestamp,
    username: username,
    bits: bits,
    message: message,
    spinTriggered: spinTriggered
  };
  io.emit('new-donation', donationData);
  
  if (spinTriggered) {
    io.emit('spin-alert', donationData);
  }
}

// Get recent donations for display
function getRecentDonations() {
  if (!fs.existsSync(CSV_PATH)) {
    return [];
  }
  
  try {
    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header and get the most recent donations
    const donations = [];
    const dataLines = lines.slice(1).reverse().slice(0, RECENT_DONATIONS_LIMIT);
    
    dataLines.forEach(line => {
      // Parse CSV line - properly handling quoted fields that may contain commas
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5) {
        donations.push({
          timestamp: parts[0],
          username: parts[1].replace(/"/g, ''),
          bits: parseInt(parts[2]),
          message: parts[3].replace(/"/g, ''),
          spinTriggered: parts[4].trim() === 'YES'
        });
      }
    });
    
    return donations;
  } catch (error) {
    console.error('Error reading donation history:', error);
    return [];
  }
}

// Calculate statistics
function getDonationStats() {
  if (!fs.existsSync(CSV_PATH)) {
    return {
      totalDonations: 0,
      totalBits: 0,
      totalSpins: 0,
      topDonator: 'None'
    };
  }
  
  try {
    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header
    const dataLines = lines.slice(1);
    
    let totalBits = 0;
    let totalSpins = 0;
    const donatorMap = {};
    
    dataLines.forEach(line => {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5) {
        const username = parts[1].replace(/"/g, '');
        const bits = parseInt(parts[2]);
        const spinTriggered = parts[4].trim() === 'YES';
        
        totalBits += bits;
        if (spinTriggered) totalSpins++;
        
        if (donatorMap[username]) {
          donatorMap[username] += bits;
        } else {
          donatorMap[username] = bits;
        }
      }
    });
    
    // Find top donator
    let topDonator = 'None';
    let maxBits = 0;
    
    Object.keys(donatorMap).forEach(username => {
      if (donatorMap[username] > maxBits) {
        maxBits = donatorMap[username];
        topDonator = username;
      }
    });
    
    return {
      totalDonations: dataLines.length,
      totalBits: totalBits,
      totalSpins: totalSpins,
      topDonator: topDonator,
      topDonatorBits: maxBits
    };
  } catch (error) {
    console.error('Error calculating donation stats:', error);
    return {
      totalDonations: 0,
      totalBits: 0,
      totalSpins: 0,
      topDonator: 'None'
    };
  }
}

// Configure Twitch chat client
const twitchClientOptions = {
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true
  },
  identity: {
    username: TWITCH_USERNAME,
    password: TWITCH_OAUTH_TOKEN
  },
  channels: [CHANNEL_NAME]
};

const client = new tmi.Client(TWITCH_OAUTH_TOKEN ? twitchClientOptions : {
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true
  },
  channels: [CHANNEL_NAME]
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/donations', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'donations.html'));
});

app.get('/api/donations', (req, res) => {
  const recentDonations = getRecentDonations();
  const stats = getDonationStats();
  res.json({
    donations: recentDonations,
    stats: stats
  });
});

app.get('/api/donations/download', (req, res) => {
  if (fs.existsSync(CSV_PATH)) {
    const data = fs.readFileSync(CSV_PATH, 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bit_donations.csv');
    res.send(data);
  } else {
    res.status(404).send('No donations recorded yet');
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Send initial data to the connected client
  const recentDonations = getRecentDonations();
  const stats = getDonationStats();
  socket.emit('initial-data', {
    donations: recentDonations,
    stats: stats
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Connect to Twitch
client.connect()
  .then(() => {
    console.log(`Successfully connected to ${CHANNEL_NAME}'s channel`);
  })
  .catch(err => {
    console.error('Error connecting to Twitch:', err);
  });

// Listen for cheer events
client.on('cheer', (channel, userstate, message) => {
  const username = userstate.username || 'anonymous';
  const bits = userstate.bits;
  const spinTriggered = bits >= BIT_THRESHOLD_FOR_SPIN;
  
  console.log(`${username} cheered ${bits} bits!`);
  
  // Record to CSV
  recordDonation(username, bits, message, spinTriggered);
  
  // Alert for spin if threshold met
  if (spinTriggered) {
    console.log(`🎉 SPIN ALERT! ${username} donated ${bits} bits!`);
  }
});

// Handle connection errors
client.on('disconnected', (reason) => {
  console.error(`Disconnected from Twitch: ${reason}`);
  setTimeout(() => {
    console.log('Attempting to reconnect to Twitch...');
    client.connect().catch(console.error);
  }, 5000); // Try to reconnect after 5 seconds
});

// Initialize and start the server
initializeCSV();
server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
  console.log(`Bit donation tracker is running for channel: ${CHANNEL_NAME}`);
  console.log(`Spin threshold: ${BIT_THRESHOLD_FOR_SPIN} bits`);
});

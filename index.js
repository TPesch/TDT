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
const GIFT_SUB_THRESHOLD = 3; // Number of gift subs needed to trigger a spin
const CSV_PATH = path.join(__dirname, 'bit_donations.csv');
const GIFT_SUBS_CSV_PATH = path.join(__dirname, 'gift_subs.csv'); // Track gift subs
const SPIN_COMMANDS_CSV_PATH = path.join(__dirname, 'spin_commands.csv'); // Track !spin usage
const RECENT_DONATIONS_LIMIT = 10; // Number of recent donations to display

// Get Twitch credentials from environment variables
const TWITCH_USERNAME = process.env.TWITCH_USERNAME || 'justinfan12345'; // Anonymous fallback
const TWITCH_OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || ''; // No auth token for anonymous

// Initialize express app and socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 5000; // Use port 5000 as required

// Initialize CSV files if they don't exist
function initializeCSV() {
  // Bits donations CSV
  if (!fs.existsSync(CSV_PATH)) {
    const header = 'Timestamp,Username,Bits,Message,SpinTriggered\n';
    fs.writeFileSync(CSV_PATH, header);
    console.log('Bits donations CSV file created successfully!');
  }
  
  // Gift subs CSV
  if (!fs.existsSync(GIFT_SUBS_CSV_PATH)) {
    const header = 'Timestamp,Username,SubCount,RecipientUsernames,SpinTriggered\n';
    fs.writeFileSync(GIFT_SUBS_CSV_PATH, header);
    console.log('Gift subs CSV file created successfully!');
  }
  
  // Spin commands CSV
  if (!fs.existsSync(SPIN_COMMANDS_CSV_PATH)) {
    const header = 'Timestamp,Username,Command\n';
    fs.writeFileSync(SPIN_COMMANDS_CSV_PATH, header);
    console.log('Spin commands CSV file created successfully!');
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

// Record gift subs to CSV
function recordGiftSubs(username, subCount, recipients, spinTriggered) {
  const timestamp = new Date().toISOString();
  // Format recipients as a comma-separated list inside quotes
  const recipientsStr = recipients && recipients.length > 0 
    ? `"${recipients.join(', ')}"`
    : '""';
  
  const newRow = `${timestamp},"${username}",${subCount},${recipientsStr},${spinTriggered ? 'YES' : 'NO'}\n`;
  
  fs.appendFileSync(GIFT_SUBS_CSV_PATH, newRow);
  console.log(`Recorded ${subCount} gift subs from ${username}`);
  
  // Send real-time update to connected clients
  const giftSubData = {
    timestamp: timestamp,
    username: username,
    subCount: subCount,
    recipients: recipients || [],
    spinTriggered: spinTriggered
  };
  io.emit('new-gift-sub', giftSubData);
  
  if (spinTriggered) {
    io.emit('spin-alert', {
      timestamp: timestamp,
      username: username,
      bits: 0, // No bits for gift subs
      message: `Gift subscriptions x${subCount}`,
      spinTriggered: true,
      isGiftSub: true,
      subCount: subCount
    });
  }
}

// Record spin command to CSV
function recordSpinCommand(username, command) {
  const timestamp = new Date().toISOString();
  const newRow = `${timestamp},"${username}","${command}"\n`;
  
  fs.appendFileSync(SPIN_COMMANDS_CSV_PATH, newRow);
  console.log(`Recorded !spin command from ${username}`);
  
  // Send real-time update to connected clients
  const commandData = {
    timestamp: timestamp,
    username: username,
    command: command
  };
  io.emit('new-spin-command', commandData);
}

// Get recent gift subs
function getRecentGiftSubs() {
  if (!fs.existsSync(GIFT_SUBS_CSV_PATH)) {
    return [];
  }
  
  try {
    const fileContent = fs.readFileSync(GIFT_SUBS_CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header and get the most recent gift subs
    const giftSubs = [];
    const dataLines = lines.slice(1).reverse().slice(0, RECENT_DONATIONS_LIMIT);
    
    dataLines.forEach(line => {
      // Parse CSV line - properly handling quoted fields that may contain commas
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5) {
        const recipients = parts[3].replace(/"/g, '').split(', ').filter(r => r.trim() !== '');
        giftSubs.push({
          timestamp: parts[0],
          username: parts[1].replace(/"/g, ''),
          subCount: parseInt(parts[2]),
          recipients: recipients,
          spinTriggered: parts[4].trim() === 'YES'
        });
      }
    });
    
    return giftSubs;
  } catch (error) {
    console.error('Error reading gift subs history:', error);
    return [];
  }
}

// Get gift sub statistics
function getGiftSubStats() {
  if (!fs.existsSync(GIFT_SUBS_CSV_PATH)) {
    return {
      totalGiftSubs: 0,
      totalSpins: 0,
      topGifter: 'None'
    };
  }
  
  try {
    const fileContent = fs.readFileSync(GIFT_SUBS_CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header
    const dataLines = lines.slice(1);
    
    let totalGiftSubs = 0;
    let totalSpins = 0;
    const gifterMap = {};
    
    dataLines.forEach(line => {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5) {
        const username = parts[1].replace(/"/g, '');
        const subCount = parseInt(parts[2]);
        const spinTriggered = parts[4].trim() === 'YES';
        
        totalGiftSubs += subCount;
        if (spinTriggered) totalSpins++;
        
        if (gifterMap[username]) {
          gifterMap[username] += subCount;
        } else {
          gifterMap[username] = subCount;
        }
      }
    });
    
    // Find top gifter
    let topGifter = 'None';
    let maxSubs = 0;
    
    Object.keys(gifterMap).forEach(username => {
      if (gifterMap[username] > maxSubs) {
        maxSubs = gifterMap[username];
        topGifter = username;
      }
    });
    
    return {
      totalGiftSubs: totalGiftSubs,
      totalSpins: totalSpins,
      topGifter: topGifter,
      topGifterSubs: maxSubs
    };
  } catch (error) {
    console.error('Error calculating gift sub stats:', error);
    return {
      totalGiftSubs: 0,
      totalSpins: 0,
      topGifter: 'None'
    };
  }
}

// Get recent spin commands
function getRecentSpinCommands() {
  if (!fs.existsSync(SPIN_COMMANDS_CSV_PATH)) {
    return [];
  }
  
  try {
    const fileContent = fs.readFileSync(SPIN_COMMANDS_CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header and get the most recent commands
    const commands = [];
    const dataLines = lines.slice(1).reverse().slice(0, RECENT_DONATIONS_LIMIT);
    
    dataLines.forEach(line => {
      // Parse CSV line - properly handling quoted fields that may contain commas
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 3) {
        commands.push({
          timestamp: parts[0],
          username: parts[1].replace(/"/g, ''),
          command: parts[2].replace(/"/g, '')
        });
      }
    });
    
    return commands;
  } catch (error) {
    console.error('Error reading spin commands history:', error);
    return [];
  }
}

// Get spin command statistics
function getSpinCommandStats() {
  if (!fs.existsSync(SPIN_COMMANDS_CSV_PATH)) {
    return {
      totalCommands: 0,
      uniqueUsers: 0
    };
  }
  
  try {
    const fileContent = fs.readFileSync(SPIN_COMMANDS_CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header
    const dataLines = lines.slice(1);
    const uniqueUsers = new Set();
    
    dataLines.forEach(line => {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 3) {
        const username = parts[1].replace(/"/g, '');
        uniqueUsers.add(username);
      }
    });
    
    return {
      totalCommands: dataLines.length,
      uniqueUsers: uniqueUsers.size
    };
  } catch (error) {
    console.error('Error calculating spin command stats:', error);
    return {
      totalCommands: 0,
      uniqueUsers: 0
    };
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

app.get('/gift-subs', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'gift-subs.html'));
});

app.get('/spin-commands', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'spin-commands.html'));
});

app.get('/api/donations', (req, res) => {
  const recentDonations = getRecentDonations();
  const stats = getDonationStats();
  res.json({
    donations: recentDonations,
    stats: stats
  });
});

// Add Express JSON middleware for parsing request bodies
app.use(express.json());

// API endpoint to update spin status
app.post('/api/donations/update-spin', (req, res) => {
  const { timestamp, spinTriggered } = req.body;
  
  if (!timestamp || spinTriggered === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Read CSV file
    if (!fs.existsSync(CSV_PATH)) {
      return res.status(404).json({ error: 'Donation records not found' });
    }
    
    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    // Find the line with matching timestamp
    let updated = false;
    const updatedLines = dataLines.map(line => {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5 && parts[0].trim() === timestamp.trim()) {
        // Update the spin status
        parts[4] = spinTriggered ? 'YES' : 'NO';
        updated = true;
        return parts.join(',');
      }
      return line;
    });
    
    if (!updated) {
      return res.status(404).json({ error: 'Donation not found' });
    }
    
    // Write back to CSV
    const updatedContent = [header, ...updatedLines].join('\n');
    fs.writeFileSync(CSV_PATH, updatedContent);
    
    // Send updated donations data
    const recentDonations = getRecentDonations();
    const stats = getDonationStats();
    res.json({
      success: true, 
      message: 'Spin status updated successfully',
      donations: recentDonations,
      stats: stats
    });
  } catch (error) {
    console.error('Error updating spin status:', error);
    res.status(500).json({ error: 'Failed to update spin status' });
  }
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

// API endpoints for gift subs
app.get('/api/gift-subs', (req, res) => {
  const recentGiftSubs = getRecentGiftSubs();
  const stats = getGiftSubStats();
  res.json({
    giftSubs: recentGiftSubs,
    giftSubStats: stats
  });
});

// API endpoint to update gift sub spin status
app.post('/api/gift-subs/update-spin', (req, res) => {
  const { timestamp, spinTriggered } = req.body;
  
  if (!timestamp || spinTriggered === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Read CSV file
    if (!fs.existsSync(GIFT_SUBS_CSV_PATH)) {
      return res.status(404).json({ error: 'Gift sub records not found' });
    }
    
    const fileContent = fs.readFileSync(GIFT_SUBS_CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    // Find the line with matching timestamp
    let updated = false;
    const updatedLines = dataLines.map(line => {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5 && parts[0].trim() === timestamp.trim()) {
        // Update the spin status
        parts[4] = spinTriggered ? 'YES' : 'NO';
        updated = true;
        return parts.join(',');
      }
      return line;
    });
    
    if (!updated) {
      return res.status(404).json({ error: 'Gift sub not found' });
    }
    
    // Write back to CSV
    const updatedContent = [header, ...updatedLines].join('\n');
    fs.writeFileSync(GIFT_SUBS_CSV_PATH, updatedContent);
    
    // Send updated donations data
    const recentGiftSubs = getRecentGiftSubs();
    const giftSubStats = getGiftSubStats();
    res.json({
      success: true, 
      message: 'Gift sub spin status updated successfully',
      giftSubs: recentGiftSubs,
      giftSubStats: giftSubStats
    });
  } catch (error) {
    console.error('Error updating gift sub spin status:', error);
    res.status(500).json({ error: 'Failed to update gift sub spin status' });
  }
});

app.get('/api/gift-subs/download', (req, res) => {
  if (fs.existsSync(GIFT_SUBS_CSV_PATH)) {
    const data = fs.readFileSync(GIFT_SUBS_CSV_PATH, 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=gift_subs.csv');
    res.send(data);
  } else {
    res.status(404).send('No gift subs recorded yet');
  }
});

// API endpoints for spin commands
app.get('/api/spin-commands', (req, res) => {
  const recentCommands = getRecentSpinCommands();
  const stats = getSpinCommandStats();
  res.json({
    commands: recentCommands,
    stats: stats
  });
});

app.get('/api/spin-commands/download', (req, res) => {
  if (fs.existsSync(SPIN_COMMANDS_CSV_PATH)) {
    const data = fs.readFileSync(SPIN_COMMANDS_CSV_PATH, 'utf8');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=spin_commands.csv');
    res.send(data);
  } else {
    res.status(404).send('No spin commands recorded yet');
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Send initial data to the connected client
  const recentDonations = getRecentDonations();
  const stats = getDonationStats();
  const recentGiftSubs = getRecentGiftSubs();
  const giftSubStats = getGiftSubStats();
  const recentSpinCommands = getRecentSpinCommands();
  const spinCommandStats = getSpinCommandStats();
  
  socket.emit('initial-data', {
    donations: recentDonations,
    stats: stats,
    giftSubs: recentGiftSubs,
    giftSubStats: giftSubStats,
    spinCommands: recentSpinCommands,
    spinCommandStats: spinCommandStats
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
  
  // Check if this individual donation meets the threshold
  const spinTriggered = bits >= BIT_THRESHOLD_FOR_SPIN;
  
  console.log(`${username} cheered ${bits} bits!`);
  
  // Record to CSV
  recordDonation(username, bits, message, spinTriggered);
  
  // Alert for spin if threshold met for this individual donation
  if (spinTriggered) {
    console.log(`🎉 SPIN ALERT! ${username} donated ${bits} bits (over the ${BIT_THRESHOLD_FOR_SPIN} threshold)!`);
  }
});

// Listen for gift sub events
client.on('submysterygift', (channel, username, subCount, methods, userstate) => {
  // Get recipients if available (not always present in the event)
  const recipients = [];
  
  // Check if gift sub count meets or exceeds the threshold
  const spinTriggered = subCount >= GIFT_SUB_THRESHOLD;
  
  console.log(`${username} gifted ${subCount} subs!`);
  
  // Record to gift subs CSV
  recordGiftSubs(username, subCount, recipients, spinTriggered);
  
  // Alert for spin if threshold met
  if (spinTriggered) {
    console.log(`🎉 SPIN ALERT! ${username} gifted ${subCount} subs (over the ${GIFT_SUB_THRESHOLD} threshold)!`);
  }
});

// Listen for individual gift sub events to collect recipient names
client.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
  // We don't need to trigger anything here, just for tracking recipients
  console.log(`${username} gifted a sub to ${recipient}.`);
});

// Listen for chat messages to track !spin command
client.on('message', (channel, userstate, message, self) => {
  // Ignore messages from the bot itself
  if (self) return;
  
  // Check if message starts with !spin
  if (message.trim().toLowerCase().startsWith('!spin')) {
    const username = userstate.username || 'anonymous';
    console.log(`${username} used the !spin command: ${message}`);
    
    // Record the command usage
    recordSpinCommand(username, message.trim());
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

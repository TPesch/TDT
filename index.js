// Twitch bit donation tracker for girl_dm_
const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Configuration
const CHANNEL_NAME = 'girl_dm_';
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Default thresholds that can be adjusted 
let BIT_THRESHOLD_FOR_SPIN = 1000; // Bits needed for a spin
let GIFT_SUB_THRESHOLD = 3; // Number of gift subs needed to trigger a spin

// File paths
const CSV_PATH = path.join(__dirname, 'bit_donations.csv');
const GIFT_SUBS_CSV_PATH = path.join(__dirname, 'gift_subs.csv'); // Track gift subs
const SPIN_COMMANDS_CSV_PATH = path.join(__dirname, 'spin_commands.csv'); // Track !spin usage
const RECENT_DONATIONS_LIMIT = 10; // Number of recent donations to display

// Load configuration from file if it exists
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(configData);
      
      if (config.bitThreshold) BIT_THRESHOLD_FOR_SPIN = config.bitThreshold;
      if (config.giftSubThreshold) GIFT_SUB_THRESHOLD = config.giftSubThreshold;
      
      console.log(`Loaded configuration: Bit threshold = ${BIT_THRESHOLD_FOR_SPIN}, Gift sub threshold = ${GIFT_SUB_THRESHOLD}`);
    } else {
      // Create default config file if it doesn't exist
      const defaultConfig = {
        bitThreshold: BIT_THRESHOLD_FOR_SPIN,
        giftSubThreshold: GIFT_SUB_THRESHOLD
      };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
      console.log('Created default configuration file');
    }
  } catch (error) {
    console.error('Error loading configuration:', error);
  }
}

// Save current thresholds to configuration file
function saveConfig(bitThreshold, giftSubThreshold) {
  try {
    const config = {
      bitThreshold: bitThreshold || BIT_THRESHOLD_FOR_SPIN,
      giftSubThreshold: giftSubThreshold || GIFT_SUB_THRESHOLD
    };
    
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`Saved configuration: Bit threshold = ${config.bitThreshold}, Gift sub threshold = ${config.giftSubThreshold}`);
    
    // Update current thresholds
    BIT_THRESHOLD_FOR_SPIN = config.bitThreshold;
    GIFT_SUB_THRESHOLD = config.giftSubThreshold;
    
    return true;
  } catch (error) {
    console.error('Error saving configuration:', error);
    return false;
  }
}

// Load configuration on startup
loadConfig();

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

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'settings.html'));
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

// API endpoint to update thresholds
app.post('/api/config/update-thresholds', (req, res) => {
  const { bitThreshold, giftSubThreshold } = req.body;
  
  if (!bitThreshold && !giftSubThreshold) {
    return res.status(400).json({ error: 'At least one threshold value is required' });
  }
  
  try {
    // Update configuration
    const updatedConfig = saveConfig(
      bitThreshold || BIT_THRESHOLD_FOR_SPIN,
      giftSubThreshold || GIFT_SUB_THRESHOLD
    );
    
    if (updatedConfig) {
      console.log(`Thresholds updated via API: bits=${BIT_THRESHOLD_FOR_SPIN}, subs=${GIFT_SUB_THRESHOLD}`);
      
      // Send updated thresholds to all clients
      io.emit('thresholds-update', {
        bitThreshold: BIT_THRESHOLD_FOR_SPIN,
        giftSubThreshold: GIFT_SUB_THRESHOLD
      });
      
      return res.json({
        success: true,
        message: 'Thresholds updated successfully',
        config: {
          bitThreshold: BIT_THRESHOLD_FOR_SPIN,
          giftSubThreshold: GIFT_SUB_THRESHOLD
        }
      });
    } else {
      return res.status(500).json({ error: 'Failed to update thresholds' });
    }
  } catch (error) {
    console.error('Error updating thresholds via API:', error);
    res.status(500).json({ error: 'Failed to update thresholds' });
  }
});

// API endpoint to get current thresholds
app.get('/api/config/thresholds', (req, res) => {
  res.json({
    bitThreshold: BIT_THRESHOLD_FOR_SPIN,
    giftSubThreshold: GIFT_SUB_THRESHOLD
  });
});

// Test endpoint to simulate mod !spin commands (for testing only)
app.post('/api/test-command', (req, res) => {
  const { message, username = 'TestMod' } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  console.log(`Test command received: ${message} from ${username}`);
  
  // Process the command as if it came from a mod
  if (message.trim().toLowerCase().startsWith('!spin')) {
    recordSpinCommand(username, message.trim());
    const result = processSpinCommand(username, message.trim());
    return res.json(result);
  } else if (message.trim().toLowerCase().startsWith('!setthreshold')) {
    // Try to parse threshold values
    const match = message.match(/!setthreshold\s+bits=(\d+)\s+subs=(\d+)/i);
    
    if (match && match[1] && match[2]) {
      const bitThreshold = parseInt(match[1]);
      const subThreshold = parseInt(match[2]);
      
      // Update configuration
      const saved = saveConfig(bitThreshold, subThreshold);
      
      if (saved) {
        console.log(`Test command: ${username} updated thresholds: bits=${bitThreshold}, subs=${subThreshold}`);
        return res.json({
          success: true,
          message: `Thresholds updated: bits=${bitThreshold}, subs=${subThreshold}`,
          config: {
            bitThreshold: BIT_THRESHOLD_FOR_SPIN,
            giftSubThreshold: GIFT_SUB_THRESHOLD
          }
        });
      }
    }
    
    return res.status(400).json({ error: 'Invalid threshold format' });
  }
  
  return res.status(400).json({ error: 'Unsupported command' });
});

// API endpoint to get combined data in a single CSV
app.get('/api/combined/download', (req, res) => {
  try {
    // Check if all files exist
    const bitDonationsExists = fs.existsSync(CSV_PATH);
    const giftSubsExists = fs.existsSync(GIFT_SUBS_CSV_PATH);
    const spinCommandsExists = fs.existsSync(SPIN_COMMANDS_CSV_PATH);
    
    if (!bitDonationsExists && !giftSubsExists && !spinCommandsExists) {
      return res.status(404).send('No data recorded yet');
    }
    
    // Create a combined CSV with sections
    let combinedData = 'TWITCH BIT DONATION TRACKER - COMBINED DATA\n\n';
    
    // Add bit donations
    if (bitDonationsExists) {
      const bitData = fs.readFileSync(CSV_PATH, 'utf8');
      combinedData += '### BIT DONATIONS ###\n';
      combinedData += bitData + '\n\n';
    }
    
    // Add gift subs
    if (giftSubsExists) {
      const giftData = fs.readFileSync(GIFT_SUBS_CSV_PATH, 'utf8');
      combinedData += '### GIFT SUBSCRIPTIONS ###\n';
      combinedData += giftData + '\n\n';
    }
    
    // Add spin commands
    if (spinCommandsExists) {
      const commandData = fs.readFileSync(SPIN_COMMANDS_CSV_PATH, 'utf8');
      combinedData += '### !SPIN COMMANDS ###\n';
      combinedData += commandData + '\n\n';
    }
    
    // Add timestamp
    combinedData += `\nExported: ${new Date().toISOString()}`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=twitch_tracker_combined_data.csv');
    res.send(combinedData);
  } catch (error) {
    console.error('Error generating combined CSV:', error);
    res.status(500).send('Error generating combined CSV');
  }
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

// Find most recent donation for a username
function findRecentDonationByUsername(targetUsername) {
  if (!fs.existsSync(CSV_PATH)) {
    return null;
  }
  
  try {
    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header
    const dataLines = lines.slice(1).reverse(); // Most recent first
    
    // Try to find the donation by username
    for (const line of dataLines) {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5) {
        const username = parts[1].replace(/"/g, '').toLowerCase();
        
        // Check if this username matches our target (case insensitive)
        if (username === targetUsername.toLowerCase()) {
          return {
            timestamp: parts[0],
            username: parts[1].replace(/"/g, ''),
            bits: parseInt(parts[2]),
            message: parts[3].replace(/"/g, ''),
            spinTriggered: parts[4].trim() === 'YES'
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding donation by username:', error);
    return null;
  }
}

// Find most recent gift sub for a username
function findRecentGiftSubByUsername(targetUsername) {
  if (!fs.existsSync(GIFT_SUBS_CSV_PATH)) {
    return null;
  }
  
  try {
    const fileContent = fs.readFileSync(GIFT_SUBS_CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Skip header
    const dataLines = lines.slice(1).reverse(); // Most recent first
    
    // Try to find the gift sub by username
    for (const line of dataLines) {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5) {
        const username = parts[1].replace(/"/g, '').toLowerCase();
        
        // Check if this username matches our target (case insensitive)
        if (username === targetUsername.toLowerCase()) {
          const recipients = parts[3].replace(/"/g, '').split(', ').filter(r => r.trim() !== '');
          return {
            timestamp: parts[0],
            username: parts[1].replace(/"/g, ''),
            subCount: parseInt(parts[2]),
            recipients: recipients,
            spinTriggered: parts[4].trim() === 'YES'
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding gift sub by username:', error);
    return null;
  }
}

// Update spin triggered status for a donation
function updateDonationSpinStatus(timestamp, spinTriggered) {
  if (!fs.existsSync(CSV_PATH)) {
    return false;
  }
  
  try {
    const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    // Find and update the line with the matching timestamp
    let updated = false;
    const updatedLines = dataLines.map(line => {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5 && parts[0].trim() === timestamp.trim()) {
        parts[4] = spinTriggered ? 'YES' : 'NO';
        updated = true;
        return parts.join(',');
      }
      return line;
    });
    
    if (!updated) {
      return false;
    }
    
    // Write back to file
    const updatedContent = [header, ...updatedLines].join('\n');
    fs.writeFileSync(CSV_PATH, updatedContent);
    return true;
  } catch (error) {
    console.error('Error updating donation spin status:', error);
    return false;
  }
}

// Update spin triggered status for a gift sub
function updateGiftSubSpinStatus(timestamp, spinTriggered) {
  if (!fs.existsSync(GIFT_SUBS_CSV_PATH)) {
    return false;
  }
  
  try {
    const fileContent = fs.readFileSync(GIFT_SUBS_CSV_PATH, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    // Find and update the line with the matching timestamp
    let updated = false;
    const updatedLines = dataLines.map(line => {
      const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
      const parts = line.split(regex);
      
      if (parts.length >= 5 && parts[0].trim() === timestamp.trim()) {
        parts[4] = spinTriggered ? 'YES' : 'NO';
        updated = true;
        return parts.join(',');
      }
      return line;
    });
    
    if (!updated) {
      return false;
    }
    
    // Write back to file
    const updatedContent = [header, ...updatedLines].join('\n');
    fs.writeFileSync(GIFT_SUBS_CSV_PATH, updatedContent);
    return true;
  } catch (error) {
    console.error('Error updating gift sub spin status:', error);
    return false;
  }
}

// Process a !spin command for a user
function processSpinCommand(modUsername, message) {
  // Extract the target username from the message
  const match = message.match(/!spin\s+@?(\w+)/i);
  
  if (!match || !match[1]) {
    console.log(`Invalid spin command format from ${modUsername}: ${message}`);
    return {
      success: false,
      message: 'Invalid command format. Use: !spin @username'
    };
  }
  
  const targetUsername = match[1];
  console.log(`${modUsername} used !spin command for ${targetUsername}`);
  
  // First, try to find a bit donation for this user
  const donation = findRecentDonationByUsername(targetUsername);
  
  if (donation) {
    // Only update if it's not already marked as triggered
    if (!donation.spinTriggered) {
      const updated = updateDonationSpinStatus(donation.timestamp, true);
      
      if (updated) {
        console.log(`Marked bit donation from ${targetUsername} for spin`);
        
        // Send spin alert to all clients
        io.emit('spin-alert', {
          timestamp: donation.timestamp,
          username: donation.username,
          bits: donation.bits,
          message: donation.message,
          spinTriggered: true
        });
        
        return {
          success: true,
          type: 'bit_donation',
          donation: donation
        };
      }
    } else {
      console.log(`Donation from ${targetUsername} was already marked for spin`);
    }
  }
  
  // If no bit donation, try to find a gift sub for this user
  const giftSub = findRecentGiftSubByUsername(targetUsername);
  
  if (giftSub) {
    // Only update if it's not already marked as triggered
    if (!giftSub.spinTriggered) {
      const updated = updateGiftSubSpinStatus(giftSub.timestamp, true);
      
      if (updated) {
        console.log(`Marked gift sub from ${targetUsername} for spin`);
        
        // Send spin alert to all clients
        io.emit('spin-alert', {
          timestamp: giftSub.timestamp,
          username: giftSub.username,
          bits: 0,
          message: `Gift subscriptions x${giftSub.subCount}`,
          spinTriggered: true,
          isGiftSub: true,
          subCount: giftSub.subCount
        });
        
        return {
          success: true,
          type: 'gift_sub',
          giftSub: giftSub
        };
      }
    } else {
      console.log(`Gift sub from ${targetUsername} was already marked for spin`);
    }
  }
  
  // No valid donation or gift sub found for the user
  console.log(`No recent donations or gift subs found for ${targetUsername}`);
  return {
    success: false,
    message: `No recent donations or gift subs found for ${targetUsername}`
  };
}

// Listen for chat messages to track !spin command
client.on('message', (channel, userstate, message, self) => {
  // Ignore messages from the bot itself
  if (self) return;
  
  const username = userstate.username || 'anonymous';
  
  // Check if message starts with !spin
  if (message.trim().toLowerCase().startsWith('!spin')) {
    // Record the command usage regardless of format
    recordSpinCommand(username, message.trim());
    
    // Check if this is a mod or broadcaster
    const isMod = userstate.mod || userstate.badges?.broadcaster === '1';
    
    // If user is a mod, try to process the spin command
    if (isMod) {
      const result = processSpinCommand(username, message.trim());
      
      // If the command was processed successfully, we can broadcast a confirmation
      if (result.success) {
        // We already send the spin alert in the processSpinCommand function
        console.log(`Mod ${username} successfully processed spin for a user`);
      }
    }
  } else if (message.trim().toLowerCase().startsWith('!setthreshold')) {
    // Additional command for mods to set thresholds
    const isMod = userstate.mod || userstate.badges?.broadcaster === '1';
    
    if (isMod) {
      // Try to parse threshold values
      const match = message.match(/!setthreshold\s+bits=(\d+)\s+subs=(\d+)/i);
      
      if (match && match[1] && match[2]) {
        const bitThreshold = parseInt(match[1]);
        const subThreshold = parseInt(match[2]);
        
        // Update configuration
        const saved = saveConfig(bitThreshold, subThreshold);
        
        if (saved) {
          console.log(`Mod ${username} updated thresholds: bits=${bitThreshold}, subs=${subThreshold}`);
        }
      } else {
        console.log(`Invalid threshold format from ${username}: ${message}`);
      }
    }
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

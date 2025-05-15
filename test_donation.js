// Test script to simulate a Twitch bit donation
const fs = require('fs');
const path = require('path');

// Configuration
const CSV_PATH = path.join(__dirname, 'bit_donations.csv');

// Create test donation
function createTestDonation() {
  // Check if CSV file exists, create if not
  if (!fs.existsSync(CSV_PATH)) {
    const header = 'Timestamp,Username,Bits,Message,SpinTriggered\n';
    fs.writeFileSync(CSV_PATH, header);
    console.log('Created CSV file');
  }
  
  // Create a test donation
  const timestamp = new Date().toISOString();
  const username = 'TestUser123';
  const bits = 900; // Below threshold
  const message = 'This is a test donation!';
  const spinTriggered = false;
  
  const newRow = `${timestamp},"${username}",${bits},"${message}",${spinTriggered ? 'YES' : 'NO'}\n`;
  fs.appendFileSync(CSV_PATH, newRow);
  
  console.log(`Added test donation: ${username} donated ${bits} bits`);
  console.log(`Timestamp: ${timestamp}`);
  
  // Create another test donation with a different user
  const timestamp2 = new Date(new Date().getTime() + 1000).toISOString(); // 1 second later
  const username2 = 'BigDonator456';
  const bits2 = 1200; // Above threshold
  const message2 = 'Big donation test!';
  const spinTriggered2 = true;
  
  const newRow2 = `${timestamp2},"${username2}",${bits2},"${message2}",${spinTriggered2 ? 'YES' : 'NO'}\n`;
  fs.appendFileSync(CSV_PATH, newRow2);
  
  console.log(`Added test donation: ${username2} donated ${bits2} bits`);
  console.log(`Timestamp: ${timestamp2}`);
}

// Run the function
createTestDonation();
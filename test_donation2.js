// Test script to simulate a Twitch bit donation with a timestamp that ensures it's found
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuration
const CSV_PATH = path.join(__dirname, 'bit_donations.csv');

// Create test donation
async function createTestDonation() {
  // Check if CSV file exists, create if not
  if (!fs.existsSync(CSV_PATH)) {
    const header = 'Timestamp,Username,Bits,Message,SpinTriggered\n';
    fs.writeFileSync(CSV_PATH, header);
    console.log('Created CSV file');
  } else {
    // Read existing content
    const content = fs.readFileSync(CSV_PATH, 'utf8');
    
    // Keep the header
    const lines = content.split('\n');
    const header = lines[0];
    
    // Write back just the header to reset the file
    fs.writeFileSync(CSV_PATH, header + '\n');
    console.log('Reset CSV file');
  }
  
  // Create a test donation with a unique username that's easy to look up
  const timestamp = new Date().toISOString();
  const uniqueId = uuidv4().substring(0, 8);
  const username = `TestUser_${uniqueId}`;
  const bits = 900; // Below threshold 
  const message = 'This is a test donation!';
  const spinTriggered = false;
  
  const newRow = `${timestamp},"${username}",${bits},"${message}",${spinTriggered ? 'YES' : 'NO'}\n`;
  fs.appendFileSync(CSV_PATH, newRow);
  
  console.log(`Added test donation: ${username} donated ${bits} bits`);
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Use this command to test: curl -X POST -H "Content-Type: application/json" -d '{"message": "!spin ${username}", "username": "TestMod"}' http://localhost:5000/api/test-command`);
  
  // Create another test donation with a different user
  const timestamp2 = new Date(new Date().getTime() + 1000).toISOString(); // 1 second later
  const uniqueId2 = uuidv4().substring(0, 8);
  const username2 = `BigDonator_${uniqueId2}`;
  const bits2 = 1200; // Above threshold
  const message2 = 'Big donation test!';
  const spinTriggered2 = true;
  
  const newRow2 = `${timestamp2},"${username2}",${bits2},"${message2}",${spinTriggered2 ? 'YES' : 'NO'}\n`;
  fs.appendFileSync(CSV_PATH, newRow2);
  
  console.log(`Added test donation: ${username2} donated ${bits2} bits (already triggered spin)`);
  console.log(`Timestamp: ${timestamp2}`);
}

// Run the function
createTestDonation();
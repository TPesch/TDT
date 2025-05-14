// Client-side JavaScript for the Twitch Bit Donation Tracker
document.addEventListener('DOMContentLoaded', function() {
  // Connect to Socket.io server
  const socket = io();
  
  // DOM elements
  const donationTableBody = document.getElementById('donation-table-body');
  const spinAlert = document.getElementById('spin-alert');
  const spinAlertMessage = document.getElementById('spin-alert-message');
  const spinner = document.getElementById('spinner');
  
  // Stats elements
  const totalDonations = document.getElementById('total-donations');
  const totalBits = document.getElementById('total-bits');
  const totalSpins = document.getElementById('total-spins');
  const topDonator = document.getElementById('top-donator');
  
  // Localized date/time formatter
  const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  
  // Render a single donation row
  function renderDonationRow(donation) {
    const tr = document.createElement('tr');
    
    // Format the timestamp
    const timestamp = new Date(donation.timestamp);
    
    tr.innerHTML = `
      <td>${dateFormatter.format(timestamp)}</td>
      <td>${escapeHtml(donation.username)}</td>
      <td>${donation.bits}</td>
      <td>${escapeHtml(donation.message)}</td>
      <td class="${donation.spinTriggered ? 'spin-triggered' : ''}">${donation.spinTriggered ? 'YES' : 'NO'}</td>
    `;
    
    return tr;
  }
  
  // Escape HTML special characters to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Update stats display
  function updateStats(stats) {
    if (!stats) return;
    
    totalDonations.textContent = stats.totalDonations || 0;
    totalBits.textContent = stats.totalBits || 0;
    totalSpins.textContent = stats.totalSpins || 0;
    topDonator.textContent = stats.topDonator !== 'None' 
      ? `${stats.topDonator} (${stats.topDonatorBits || 0} bits)` 
      : 'None yet';
  }
  
  // Update donations table
  function updateDonationsTable(donations) {
    if (!donationTableBody) return;
    
    // Clear existing rows
    donationTableBody.innerHTML = '';
    
    // Add new rows
    if (donations && donations.length > 0) {
      donations.forEach(donation => {
        donationTableBody.appendChild(renderDonationRow(donation));
      });
    } else {
      // Show empty state
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="5" style="text-align: center;">No donations recorded yet</td>
      `;
      donationTableBody.appendChild(tr);
    }
  }
  
  // Animation for spin alert
  function showSpinAlert(donation) {
    if (!spinAlert || !spinAlertMessage) return;
    
    spinAlertMessage.textContent = `${donation.username} donated ${donation.bits} bits! Time to SPIN!`;
    spinAlert.style.display = 'block';
    
    // Start animation if spinner element exists
    if (spinner) {
      spinner.style.display = 'inline-block';
      spinner.style.animation = 'spin 1s linear infinite';
    }
    
    // Hide after 10 seconds
    setTimeout(() => {
      spinAlert.style.display = 'none';
      if (spinner) {
        spinner.style.animation = '';
        spinner.style.display = 'none';
      }
    }, 10000);
  }
  
  // Initial data load
  socket.on('initial-data', function(data) {
    updateDonationsTable(data.donations);
    updateStats(data.stats);
  });
  
  // New donation event
  socket.on('new-donation', function(donation) {
    // If we're on the main page with the table
    if (donationTableBody) {
      // Add to top of table
      const newRow = renderDonationRow(donation);
      if (donationTableBody.firstChild) {
        donationTableBody.insertBefore(newRow, donationTableBody.firstChild);
      } else {
        donationTableBody.appendChild(newRow);
      }
      
      // Remove the last row if we have too many
      if (donationTableBody.children.length > 10) {
        donationTableBody.removeChild(donationTableBody.lastChild);
      }
    }
    
    // Update stats via API call
    fetch('/api/donations')
      .then(response => response.json())
      .then(data => {
        updateStats(data.stats);
      })
      .catch(error => console.error('Error fetching updated stats:', error));
  });
  
  // Spin alert event
  socket.on('spin-alert', function(donation) {
    showSpinAlert(donation);
  });
  
  // If we're on the donations page, load data via API
  if (window.location.pathname === '/donations' && donationTableBody) {
    fetch('/api/donations')
      .then(response => response.json())
      .then(data => {
        updateDonationsTable(data.donations);
        updateStats(data.stats);
      })
      .catch(error => console.error('Error fetching donation data:', error));
  }
  
  // Socket connection status indicator
  socket.on('connect', function() {
    const statusIndicator = document.getElementById('connection-status');
    if (statusIndicator) {
      statusIndicator.textContent = 'Connected';
      statusIndicator.className = 'connected';
    }
  });
  
  socket.on('disconnect', function() {
    const statusIndicator = document.getElementById('connection-status');
    if (statusIndicator) {
      statusIndicator.textContent = 'Disconnected';
      statusIndicator.className = 'disconnected';
    }
  });
});

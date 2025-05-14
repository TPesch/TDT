// Client-side JavaScript for the Twitch Bit Donation Tracker
document.addEventListener('DOMContentLoaded', function() {
  // Connect to Socket.io server
  const socket = io();
  
  // DOM elements
  const donationTableBody = document.getElementById('donation-table-body');
  const spinAlert = document.getElementById('spin-alert');
  const spinAlertMessage = document.getElementById('spin-alert-message');
  const spinner = document.getElementById('spinner');
  
  // Function to update spin status via API
  window.updateSpinStatus = function(timestamp, isChecked) {
    fetch('/api/donations/update-spin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timestamp: timestamp,
        spinTriggered: isChecked
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('Spin status updated successfully');
        updateStats(data.stats);
        
        // If spin was triggered, show the spin alert
        if (isChecked) {
          // Find the donation in the updated list
          const donation = data.donations.find(d => d.timestamp === timestamp);
          if (donation) {
            showSpinAlert(donation);
          }
        }
      } else {
        console.error('Error updating spin status:', data.error);
      }
    })
    .catch(error => {
      console.error('Failed to update spin status:', error);
    });
  };
  
  // Stats elements - Bit donations
  const totalDonations = document.getElementById('total-donations');
  const totalBits = document.getElementById('total-bits');
  const totalSpins = document.getElementById('total-spins');
  const topDonator = document.getElementById('top-donator');
  
  // Stats elements - Gift subs
  const totalGiftSubs = document.getElementById('total-gift-subs');
  const giftSubSpins = document.getElementById('gift-sub-spins');
  const topGifter = document.getElementById('top-gifter');
  
  // Stats elements - !spin commands
  const totalCommands = document.getElementById('total-commands');
  const uniqueUsers = document.getElementById('unique-users');
  
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
    
    // Create a unique ID for the checkbox based on the timestamp
    const checkboxId = `spin-checkbox-${donation.timestamp.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    tr.innerHTML = `
      <td>${dateFormatter.format(timestamp)}</td>
      <td>${escapeHtml(donation.username)}</td>
      <td>${donation.bits}</td>
      <td>${escapeHtml(donation.message)}</td>
      <td class="${donation.spinTriggered ? 'spin-triggered' : ''}">
        <input type="checkbox" id="${checkboxId}" class="spin-checkbox" 
               data-timestamp="${donation.timestamp}" 
               ${donation.spinTriggered ? 'checked' : ''}>
        <label for="${checkboxId}">Spin</label>
      </td>
    `;
    
    // Add event listener to the checkbox after the row is created
    setTimeout(() => {
      const checkbox = document.getElementById(checkboxId);
      if (checkbox) {
        checkbox.addEventListener('change', function() {
          updateSpinStatus(donation.timestamp, this.checked);
        });
      }
    }, 0);
    
    return tr;
  }
  
  // Escape HTML special characters to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Update bit donation stats display
  function updateStats(stats) {
    if (!stats) return;
    
    // Update bit donation stats if elements exist
    if (totalDonations) totalDonations.textContent = stats.totalDonations || 0;
    if (totalBits) totalBits.textContent = stats.totalBits || 0;
    if (totalSpins) totalSpins.textContent = stats.totalSpins || 0;
    if (topDonator) {
      topDonator.textContent = stats.topDonator !== 'None' 
        ? `${stats.topDonator} (${stats.topDonatorBits || 0} bits)` 
        : 'None yet';
    }
  }
  
  // Update gift sub stats display
  function updateGiftSubStats(stats) {
    if (!stats) return;
    
    // Update gift sub stats if elements exist
    if (totalGiftSubs) totalGiftSubs.textContent = stats.totalGiftSubs || 0;
    if (giftSubSpins) giftSubSpins.textContent = stats.totalSpins || 0;
    if (topGifter) {
      topGifter.textContent = stats.topGifter !== 'None' 
        ? `${stats.topGifter} (${stats.topGifterSubs || 0} subs)` 
        : 'None yet';
    }
  }
  
  // Update spin command stats display
  function updateSpinCommandStats(stats) {
    if (!stats) return;
    
    // Update spin command stats if elements exist
    if (totalCommands) totalCommands.textContent = stats.totalCommands || 0;
    if (uniqueUsers) uniqueUsers.textContent = stats.uniqueUsers || 0;
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
    
    // Update gift sub stats and spin command stats on dashboard
    if (data.giftSubStats) updateGiftSubStats(data.giftSubStats);
    if (data.spinCommandStats) updateSpinCommandStats(data.spinCommandStats);
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
    
    // Update bit donation stats via API call
    fetch('/api/donations')
      .then(response => response.json())
      .then(data => {
        updateStats(data.stats);
      })
      .catch(error => console.error('Error fetching updated bit donation stats:', error));
  });
  
  // New gift sub event
  socket.on('new-gift-sub', function(giftSub) {
    // Update gift sub stats via API call
    fetch('/api/gift-subs')
      .then(response => response.json())
      .then(data => {
        updateGiftSubStats(data.giftSubStats);
      })
      .catch(error => console.error('Error fetching updated gift sub stats:', error));
  });
  
  // New spin command event
  socket.on('new-spin-command', function(command) {
    // Update spin command stats via API call
    fetch('/api/spin-commands')
      .then(response => response.json())
      .then(data => {
        updateSpinCommandStats(data.stats);
      })
      .catch(error => console.error('Error fetching updated spin command stats:', error));
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

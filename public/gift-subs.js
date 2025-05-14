// Client-side JavaScript for the Gift Subscriptions page
document.addEventListener('DOMContentLoaded', function() {
  // Connect to Socket.io server
  const socket = io();
  
  // DOM elements
  const giftSubsTableBody = document.getElementById('gift-subs-table-body');
  const spinAlert = document.getElementById('spin-alert');
  const spinAlertMessage = document.getElementById('spin-alert-message');
  const spinner = document.getElementById('spinner');
  
  // Stats elements
  const totalGiftSubs = document.getElementById('total-gift-subs');
  const totalSpins = document.getElementById('total-spins');
  const topGifter = document.getElementById('top-gifter');
  
  // Localized date/time formatter
  const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  
  // Render a single gift sub row
  function renderGiftSubRow(giftSub) {
    const tr = document.createElement('tr');
    
    // Format the timestamp
    const timestamp = new Date(giftSub.timestamp);
    
    // Create a unique ID for the checkbox based on the timestamp
    const checkboxId = `spin-checkbox-${giftSub.timestamp.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    // Format recipients if available
    const recipientsDisplay = giftSub.recipients && giftSub.recipients.length > 0 
      ? giftSub.recipients.join(', ')
      : 'Anonymous recipients';
    
    tr.innerHTML = `
      <td>${dateFormatter.format(timestamp)}</td>
      <td>${escapeHtml(giftSub.username)}</td>
      <td>${giftSub.subCount}</td>
      <td>${escapeHtml(recipientsDisplay)}</td>
      <td class="${giftSub.spinTriggered ? 'spin-triggered' : ''}">
        <input type="checkbox" id="${checkboxId}" class="spin-checkbox" 
               data-timestamp="${giftSub.timestamp}" 
               ${giftSub.spinTriggered ? 'checked' : ''}>
        <label for="${checkboxId}">Spin</label>
      </td>
    `;
    
    // Add event listener to the checkbox after the row is created
    setTimeout(() => {
      const checkbox = document.getElementById(checkboxId);
      if (checkbox) {
        checkbox.addEventListener('change', function() {
          updateSpinStatus(giftSub.timestamp, this.checked);
        });
      }
    }, 0);
    
    return tr;
  }
  
  // Escape HTML special characters to prevent XSS
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Update stats display
  function updateStats(stats) {
    if (!stats) return;
    
    totalGiftSubs.textContent = stats.totalGiftSubs || 0;
    totalSpins.textContent = stats.totalSpins || 0;
    topGifter.textContent = stats.topGifter !== 'None' 
      ? `${stats.topGifter} (${stats.topGifterSubs || 0} subs)` 
      : 'None yet';
  }
  
  // Update gift subs table
  function updateGiftSubsTable(giftSubs) {
    if (!giftSubsTableBody) return;
    
    // Clear existing rows
    giftSubsTableBody.innerHTML = '';
    
    // Add new rows
    if (giftSubs && giftSubs.length > 0) {
      giftSubs.forEach(giftSub => {
        giftSubsTableBody.appendChild(renderGiftSubRow(giftSub));
      });
    } else {
      // Show empty state
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="5" style="text-align: center;">No gift subscriptions recorded yet</td>
      `;
      giftSubsTableBody.appendChild(tr);
    }
  }
  
  // Animation for spin alert
  function showSpinAlert(giftSub) {
    if (!spinAlert || !spinAlertMessage) return;
    
    spinAlertMessage.textContent = `${giftSub.username} gifted ${giftSub.subCount} subs! Time to SPIN!`;
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
  
  // Function to update spin status via API
  function updateSpinStatus(timestamp, isChecked) {
    fetch('/api/gift-subs/update-spin', {
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
        updateStats(data.giftSubStats);
        
        // If spin was triggered, show the spin alert
        if (isChecked) {
          // Find the gift sub in the updated list
          const giftSub = data.giftSubs.find(g => g.timestamp === timestamp);
          if (giftSub) {
            showSpinAlert(giftSub);
          }
        }
      } else {
        console.error('Error updating spin status:', data.error);
      }
    })
    .catch(error => {
      console.error('Failed to update spin status:', error);
    });
  }
  
  // Initial data load
  socket.on('initial-data', function(data) {
    updateGiftSubsTable(data.giftSubs);
    updateStats(data.giftSubStats);
  });
  
  // New gift sub event
  socket.on('new-gift-sub', function(giftSub) {
    // If we're on the gift subs page with the table
    if (giftSubsTableBody) {
      // Add to top of table
      const newRow = renderGiftSubRow(giftSub);
      if (giftSubsTableBody.firstChild) {
        giftSubsTableBody.insertBefore(newRow, giftSubsTableBody.firstChild);
      } else {
        giftSubsTableBody.appendChild(newRow);
      }
      
      // Remove the last row if we have too many
      if (giftSubsTableBody.children.length > 10) {
        giftSubsTableBody.removeChild(giftSubsTableBody.lastChild);
      }
    }
    
    // Update stats via API call
    fetch('/api/gift-subs')
      .then(response => response.json())
      .then(data => {
        updateStats(data.giftSubStats);
      })
      .catch(error => console.error('Error fetching updated stats:', error));
  });
  
  // Spin alert event
  socket.on('spin-alert', function(data) {
    if (data.isGiftSub) {
      showSpinAlert({
        username: data.username,
        subCount: data.subCount
      });
    }
  });
  
  // If we're on the gift subs page, load data via API
  if (window.location.pathname === '/gift-subs' && giftSubsTableBody) {
    fetch('/api/gift-subs')
      .then(response => response.json())
      .then(data => {
        updateGiftSubsTable(data.giftSubs);
        updateStats(data.giftSubStats);
      })
      .catch(error => console.error('Error fetching gift sub data:', error));
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
// Client-side JavaScript for the Settings page
document.addEventListener('DOMContentLoaded', function() {
  // Connect to Socket.io server
  const socket = io();
  
  // DOM elements
  const bitThresholdInput = document.getElementById('bit-threshold');
  const giftSubThresholdInput = document.getElementById('gift-sub-threshold');
  const saveButton = document.getElementById('save-settings');
  const statusMessage = document.getElementById('settings-status');
  
  // Load current threshold values
  fetch('/api/config/thresholds')
    .then(response => response.json())
    .then(data => {
      bitThresholdInput.value = data.bitThreshold;
      giftSubThresholdInput.value = data.giftSubThreshold;
    })
    .catch(error => {
      console.error('Error loading threshold values:', error);
      showStatus('Failed to load current settings', 'error');
    });
  
  // Handle form submission
  saveButton.addEventListener('click', function() {
    // Get values from form
    const bitThreshold = parseInt(bitThresholdInput.value);
    const giftSubThreshold = parseInt(giftSubThresholdInput.value);
    
    // Basic validation
    if (isNaN(bitThreshold) || bitThreshold < 1) {
      showStatus('Bit threshold must be a positive number', 'error');
      return;
    }
    
    if (isNaN(giftSubThreshold) || giftSubThreshold < 1) {
      showStatus('Gift sub threshold must be a positive number', 'error');
      return;
    }
    
    // Save settings via API
    fetch('/api/config/update-thresholds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bitThreshold: bitThreshold,
        giftSubThreshold: giftSubThreshold
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showStatus('Settings saved successfully!', 'success');
      } else {
        showStatus(data.error || 'Failed to save settings', 'error');
      }
    })
    .catch(error => {
      console.error('Error saving settings:', error);
      showStatus('Failed to save settings', 'error');
    });
  });
  
  // Show status message
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'settings-status';
    
    if (type === 'success') {
      statusMessage.classList.add('success');
    } else if (type === 'error') {
      statusMessage.classList.add('error');
    }
    
    // Hide after 5 seconds
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 5000);
  }
  
  // Listen for threshold updates from the server
  socket.on('thresholds-update', function(data) {
    bitThresholdInput.value = data.bitThreshold;
    giftSubThresholdInput.value = data.giftSubThreshold;
    
    showStatus('Thresholds have been updated', 'success');
  });
  
  // Socket connection status indicator
  socket.on('connect', function() {
    console.log('Connected to server');
  });
  
  socket.on('disconnect', function() {
    console.log('Disconnected from server');
  });
});
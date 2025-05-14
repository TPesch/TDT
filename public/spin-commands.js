// Client-side JavaScript for the Spin Commands page
document.addEventListener('DOMContentLoaded', function() {
  // Connect to Socket.io server
  const socket = io();
  
  // DOM elements
  const spinCommandsTableBody = document.getElementById('spin-commands-table-body');
  
  // Stats elements
  const totalCommands = document.getElementById('total-commands');
  const uniqueUsers = document.getElementById('unique-users');
  
  // Localized date/time formatter
  const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  
  // Render a single command row
  function renderCommandRow(command) {
    const tr = document.createElement('tr');
    
    // Format the timestamp
    const timestamp = new Date(command.timestamp);
    
    tr.innerHTML = `
      <td>${dateFormatter.format(timestamp)}</td>
      <td>${escapeHtml(command.username)}</td>
      <td>${escapeHtml(command.command)}</td>
    `;
    
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
    
    totalCommands.textContent = stats.totalCommands || 0;
    uniqueUsers.textContent = stats.uniqueUsers || 0;
  }
  
  // Update commands table
  function updateCommandsTable(commands) {
    if (!spinCommandsTableBody) return;
    
    // Clear existing rows
    spinCommandsTableBody.innerHTML = '';
    
    // Add new rows
    if (commands && commands.length > 0) {
      commands.forEach(command => {
        spinCommandsTableBody.appendChild(renderCommandRow(command));
      });
    } else {
      // Show empty state
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="3" style="text-align: center;">No !spin commands recorded yet</td>
      `;
      spinCommandsTableBody.appendChild(tr);
    }
  }
  
  // Initial data load
  socket.on('initial-data', function(data) {
    updateCommandsTable(data.spinCommands);
    updateStats(data.spinCommandStats);
  });
  
  // New spin command event
  socket.on('new-spin-command', function(command) {
    // If we're on the spin commands page with the table
    if (spinCommandsTableBody) {
      // Add to top of table
      const newRow = renderCommandRow(command);
      if (spinCommandsTableBody.firstChild) {
        spinCommandsTableBody.insertBefore(newRow, spinCommandsTableBody.firstChild);
      } else {
        spinCommandsTableBody.appendChild(newRow);
      }
      
      // Remove the last row if we have too many
      if (spinCommandsTableBody.children.length > 10) {
        spinCommandsTableBody.removeChild(spinCommandsTableBody.lastChild);
      }
    }
    
    // Update stats via API call
    fetch('/api/spin-commands')
      .then(response => response.json())
      .then(data => {
        updateStats(data.stats);
      })
      .catch(error => console.error('Error fetching updated stats:', error));
  });
  
  // If we're on the spin commands page, load data via API
  if (window.location.pathname === '/spin-commands' && spinCommandsTableBody) {
    fetch('/api/spin-commands')
      .then(response => response.json())
      .then(data => {
        updateCommandsTable(data.commands);
        updateStats(data.stats);
      })
      .catch(error => console.error('Error fetching spin command data:', error));
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

const socket = io();

// DOM elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const currentTime = document.getElementById('currentTime');
const currentDate = document.getElementById('currentDate');
const currentDay = document.getElementById('currentDay');
const footerTime = document.getElementById('footerTime');
const footerDate = document.getElementById('footerDate');
const footerDay = document.getElementById('footerDay');
const stockGrid = document.getElementById('stockGrid');
const weatherSection = document.getElementById('weatherSection');
const weatherContent = document.getElementById('weatherContent');

// Admin panel state
let adminPanelOpen = false;

// Time update function
function updateDateTime() {
    const now = new Date();
    const phTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    
    const timeOptions = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Manila'
    };
    
    const dateOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Manila'
    };
    
    const dayOptions = {
        weekday: 'long',
        timeZone: 'Asia/Manila'
    };
    
    const timeString = phTime.toLocaleString('en-US', timeOptions);
    const dateString = phTime.toLocaleString('en-US', dateOptions);
    const dayString = phTime.toLocaleString('en-US', dayOptions);
    
    // Update main time display
    currentTime.textContent = timeString;
    currentDate.textContent = dateString;
    currentDay.textContent = dayString;
    
    // Update footer time display
    footerTime.textContent = timeString;
    footerDate.textContent = dateString;
    footerDay.textContent = dayString;
}

// Format value function
function formatValue(val) {
    if (val >= 1_000_000) return `x${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `x${(val / 1_000).toFixed(1)}K`;
    return `x${val}`;
}

// Create stock category HTML
function createStockCategory(title, emoji, items, restockInfo, categoryKey) {
    const availableItems = items.filter(item => item.quantity > 0);
    
    if (availableItems.length === 0) {
        return `
            <div class="stock-category" data-category="${categoryKey}">
                <div class="category-header">
                    <h3 class="category-title">${emoji} ${title}</h3>
                    <span class="item-count">0 items</span>
                </div>
                <div class="no-items">No items available</div>
                ${restockInfo ? `<div class="restock-info">⏳ Restock In: ${restockInfo}</div>` : ''}
            </div>
        `;
    }
    
    const itemsHtml = availableItems.map(item => `
        <div class="stock-item">
            <span class="item-name">${item.emoji ? item.emoji + ' ' : ''}${item.name}</span>
            <span class="item-quantity">${formatValue(item.quantity)}</span>
        </div>
    `).join('');
    
    return `
        <div class="stock-category" data-category="${categoryKey}">
            <div class="category-header">
                <h3 class="category-title">${emoji} ${title}</h3>
                <span class="item-count">${availableItems.length} items</span>
            </div>
            <div class="items-list">
                ${itemsHtml}
            </div>
            ${restockInfo ? `<div class="restock-info">⏳ Restock In: ${restockInfo}</div>` : ''}
        </div>
    `;
}

// Update stock display
function updateStockDisplay(data) {
    const { stockData, weather, updatedAt } = data;
    
    // Update weather
    if (weather) {
        weatherSection.style.display = 'block';
        weatherContent.innerHTML = `
            <div><strong>${weather.icon} ${weather.weatherType}</strong></div>
            <div>📋 ${weather.description}</div>
            <div>🎯 ${weather.cropBonuses}</div>
        `;
    }
    
    // Parse countdown times and store for updates
    const parseCountdown = (countdownStr) => {
        if (!countdownStr) return null;
        
        // Parse countdown string like "1h 23m 45s" or "23m 45s" or "45s"
        const timeMatch = countdownStr.match(/(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1] || 0);
            const minutes = parseInt(timeMatch[2] || 0);
            const seconds = parseInt(timeMatch[3] || 0);
            
            const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
            return new Date(Date.now() + totalMs);
        }
        return null;
    };

    // Create categories
    const categories = [
        {
            title: 'Gear',
            emoji: '🛠️',
            items: stockData.gear.items || [],
            restock: stockData.gear.countdown,
            key: 'gear'
        },
        {
            title: 'Seeds',
            emoji: '🌱',
            items: stockData.seed.items || [],
            restock: stockData.seed.countdown,
            key: 'seed'
        },
        {
            title: 'Eggs',
            emoji: '🥚',
            items: stockData.egg.items || [],
            restock: stockData.egg.countdown,
            key: 'egg'
        },
        {
            title: 'Cosmetics',
            emoji: '🎨',
            items: stockData.cosmetics.items || [],
            restock: stockData.cosmetics.countdown,
            key: 'cosmetics'
        },
        {
            title: 'Event',
            emoji: '🎉',
            items: stockData.event.items || [],
            restock: stockData.event.countdown,
            key: 'event'
        },
        {
            title: 'Traveling Merchant',
            emoji: '🚚',
            items: stockData.travelingmerchant.items || [],
            restock: stockData.travelingmerchant.appearIn,
            key: 'travelingmerchant'
        }
    ];
    
    // Store restock data for countdown updates
    categories.forEach(cat => {
        if (cat.restock) {
            restockData[cat.key] = {
                endTime: parseCountdown(cat.restock)
            };
        }
    });
    
    const categoriesHtml = categories.map(cat => 
        createStockCategory(cat.title, cat.emoji, cat.items, cat.restock, cat.key)
    ).join('');
    
    stockGrid.innerHTML = categoriesHtml;
    
    // Add staggered animation to categories
    const categoryElements = stockGrid.querySelectorAll('.stock-category');
    categoryElements.forEach((el, index) => {
        el.style.animationDelay = `${index * 0.1}s`;
    });
}

// Socket event handlers
socket.on('connect', () => {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected';
    console.log('Disconnected from server');
});

socket.on('stockUpdate', (data) => {
    updateStockDisplay(data);
});

socket.on('specialItemNotification', (data) => {
    showSpecialItemNotification(data);
});

socket.on('adminResponse', (data) => {
    handleAdminResponse(data);
});

socket.on('notifierUpdate', (data) => {
    showNotifierUpdate(data);
});

// Store restock data for countdown updates
let restockData = {};

// Function to update countdown timers
function updateCountdowns() {
    Object.keys(restockData).forEach(category => {
        const countdown = restockData[category];
        if (countdown && countdown.endTime) {
            const now = new Date();
            const timeLeft = countdown.endTime - now;
            
            if (timeLeft > 0) {
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                
                const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                
                const restockElement = document.querySelector(`[data-category="${category}"] .restock-info`);
                if (restockElement) {
                    restockElement.textContent = `⏳ Restock In: ${countdownText}`;
                }
            }
        }
    });
}

// Show special item notification
function showSpecialItemNotification(data) {
    const notification = document.createElement('div');
    notification.className = 'special-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <h3>🚨 SPECIAL ITEMS IN STOCK! 🚨</h3>
            <div class="special-items">
                ${data.items.map(item => 
                    `<div class="special-item">
                        <span>${item.emoji} ${item.name}</span>
                        <span class="quantity">${formatValue(item.quantity)}</span>
                        <span class="category">(${item.category})</span>
                    </div>`
                ).join('')}
            </div>
            <div class="notification-time">${data.timestamp.toLocaleString()}</div>
            <button onclick="this.parentElement.parentElement.remove()" class="close-btn">×</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 10 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 10000);
    
    // Add sound notification (optional)
    playNotificationSound();
}

// Play notification sound
function playNotificationSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfBzmI0/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfBzmI0/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfBzmI0/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfBzmI0/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfBzmI0/LNeSsFJHfH8N2QQAoUXrTp66hVFApGn+DyvmgfBzmI0/LNeSsF');
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Ignore errors if audio can't play
}

// Handle admin response
function handleAdminResponse(data) {
    const adminConsole = document.getElementById('adminConsole');
    if (adminConsole) {
        const message = document.createElement('div');
        message.className = data.success ? 'admin-success' : 'admin-error';
        message.textContent = data.message;
        adminConsole.appendChild(message);
        adminConsole.scrollTop = adminConsole.scrollHeight;
        
        if (data.notifierList) {
            updateNotifierList(data.notifierList);
        }
    }
}

// Show notifier update
function showNotifierUpdate(data) {
    if (data.type === 'userAdded') {
        showToast(`✅ ${data.user.name} subscribed to notifications (Total: ${data.totalSubscribers})`);
    }
}

// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Toggle admin panel
function toggleAdminPanel() {
    adminPanelOpen = !adminPanelOpen;
    
    if (adminPanelOpen) {
        showAdminPanel();
    } else {
        hideAdminPanel();
    }
}

// Show admin panel
function showAdminPanel() {
    const adminPanel = document.createElement('div');
    adminPanel.id = 'adminPanel';
    adminPanel.className = 'admin-panel';
    adminPanel.innerHTML = `
        <div class="admin-content">
            <div class="admin-header">
                <h3>🔑 Admin Panel</h3>
                <button onclick="toggleAdminPanel()" class="close-btn">×</button>
            </div>
            
            <div class="admin-login" id="adminLogin">
                <input type="password" id="adminPassword" placeholder="Admin Password" />
                <button onclick="authenticateAdmin()" class="admin-btn">Login</button>
            </div>
            
            <div class="admin-controls" id="adminControls" style="display: none;">
                <div class="admin-section">
                    <h4>Add Notifier</h4>
                    <input type="text" id="userIdInput" placeholder="User ID" />
                    <input type="text" id="userNameInput" placeholder="User Name" />
                    <button onclick="addNotifier()" class="admin-btn">Add User</button>
                </div>
                
                <div class="admin-section">
                    <h4>Notifier List</h4>
                    <button onclick="listNotifiers()" class="admin-btn">Refresh List</button>
                    <div id="notifierList" class="notifier-list"></div>
                </div>
                
                <div class="admin-console" id="adminConsole"></div>
            </div>
        </div>
    `;
    
    document.body.appendChild(adminPanel);
}

// Hide admin panel
function hideAdminPanel() {
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) {
        adminPanel.remove();
    }
}

// Authenticate admin
function authenticateAdmin() {
    const password = document.getElementById('adminPassword').value;
    const adminLogin = document.getElementById('adminLogin');
    const adminControls = document.getElementById('adminControls');
    
    socket.emit('adminCommand', {
        command: 'listNotifiers',
        password: password
    });
    
    // Store password for subsequent requests
    window.adminPassword = password;
    
    adminLogin.style.display = 'none';
    adminControls.style.display = 'block';
}

// Add notifier
function addNotifier() {
    const userId = document.getElementById('userIdInput').value;
    const userName = document.getElementById('userNameInput').value;
    
    if (!userId || !userName) {
        alert('Please enter both User ID and Name');
        return;
    }
    
    socket.emit('adminCommand', {
        command: 'addNotifier',
        password: window.adminPassword,
        userId: userId,
        name: userName
    });
    
    // Clear inputs
    document.getElementById('userIdInput').value = '';
    document.getElementById('userNameInput').value = '';
}

// List notifiers
function listNotifiers() {
    socket.emit('adminCommand', {
        command: 'listNotifiers',
        password: window.adminPassword
    });
}

// Update notifier list display
function updateNotifierList(notifiers) {
    const listContainer = document.getElementById('notifierList');
    if (!listContainer) return;
    
    if (notifiers.length === 0) {
        listContainer.innerHTML = '<p>No notifiers registered</p>';
        return;
    }
    
    listContainer.innerHTML = notifiers.map(user => `
        <div class="notifier-item">
            <span class="user-name">${user.name}</span>
            <span class="user-id">${user.userId}</span>
            <span class="user-platform">${user.platform || 'web'}</span>
            <button onclick="removeNotifier('${user.userId}')" class="remove-btn">Remove</button>
        </div>
    `).join('');
}

// Remove notifier
function removeNotifier(userId) {
    socket.emit('adminCommand', {
        command: 'removeNotifier',
        password: window.adminPassword,
        userId: userId
    });
}

// Initialize
updateDateTime();
setInterval(updateDateTime, 1000);
setInterval(updateCountdowns, 1000);

// Add some visual flair
document.addEventListener('DOMContentLoaded', () => {
    // Add glow animation to time elements
    currentTime.classList.add('glow-animation');
    
    // Add hover effects to category cards
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest('.stock-category')) {
            e.target.closest('.stock-category').style.transform = 'translateY(-5px) scale(1.02)';
        }
    });
    
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('.stock-category')) {
            e.target.closest('.stock-category').style.transform = 'translateY(0) scale(1)';
        }
    });
    
    // Add admin panel trigger (triple click on title)
    let clickCount = 0;
    document.querySelector('.title').addEventListener('click', () => {
        clickCount++;
        setTimeout(() => clickCount = 0, 1000);
        if (clickCount === 3) {
            toggleAdminPanel();
        }
    });
});

// Add particle effect on click
document.addEventListener('click', (e) => {
    const particle = document.createElement('div');
    particle.style.position = 'fixed';
    particle.style.left = e.clientX + 'px';
    particle.style.top = e.clientY + 'px';
    particle.style.width = '6px';
    particle.style.height = '6px';
    particle.style.background = '#00d4aa';
    particle.style.borderRadius = '50%';
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '9999';
    particle.style.animation = 'particleExplosion 0.6s ease-out forwards';
    
    document.body.appendChild(particle);
    
    setTimeout(() => {
        particle.remove();
    }, 600);
});

// Add particle explosion animation
const style = document.createElement('style');
style.textContent = `
    @keyframes particleExplosion {
        0% {
            transform: scale(1) translate(0, 0);
            opacity: 1;
        }
        100% {
            transform: scale(0) translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

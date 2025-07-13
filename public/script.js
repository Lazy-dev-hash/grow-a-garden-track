
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

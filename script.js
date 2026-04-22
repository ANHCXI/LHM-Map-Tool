let map, polyline, markerA, markerB;
let dealerships = [];
let zipCentroids = {};
let dataLoaded = false;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
    updateButtonState();
});

function loadData() {
    fetch('data.json')
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            dealerships = data.dealerships;
            zipCentroids = data.zipCentroids;
            populateBrandDropdown();
            dataLoaded = true;
            updateButtonState();
        })
        .catch(err => {
            showError("⚠️ Could not load data.json. Make sure you're running a local server.");
            console.error('Data loading error:', err);
        });
}

function populateBrandDropdown() {
    const select = document.getElementById('brandSelect');
    select.innerHTML = '<option value="all">All Brands</option>';
    
    const allBrands = new Set();
    dealerships.forEach(dealer => {
        dealer.brand.forEach(b => allBrands.add(b));
    });
    
    Array.from(allBrands).sort().forEach(brand => {
        const opt = document.createElement('option');
        opt.value = brand;
        opt.textContent = brand;
        select.appendChild(opt);
    });
}

function setupEventListeners() {
    const zipInput = document.getElementById('zipInput');
    const goBtn = document.getElementById('goBtn');
    
    zipInput.addEventListener('input', updateButtonState);
    
    zipInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') goBtn.click();
    });
    
    goBtn.addEventListener('click', handleSearch);
}

function updateButtonState() {
    const zip = document.getElementById('zipInput').value.trim();
    const btn = document.getElementById('goBtn');
    
    if (!/^\d{5}$/.test(zip)) {
        btn.disabled = true;
        btn.textContent = "Enter 5-digit ZIP";
        return;
    }
    
    if (!dataLoaded) {
        btn.disabled = true;
        btn.textContent = "Loading data...";
        return;
    }
    
    if (!zipCentroids[zip]) {
        btn.disabled = true;
        btn.textContent = "ZIP not in database";
        return;
    }
    
    btn.disabled = false;
    btn.textContent = "Find Closest Dealership";
}

function initMap(lat, lng) {
    if (map) map.remove();
    
    map = L.map('map').setView([lat, lng], 7);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map);
}

function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function findClosestDealer(zipLat, zipLng, selectedBrand) {
    let closest = null;
    let minDistance = Infinity;
    
    for (const dealer of dealerships) {
        // Skip if brand filter is set and dealer doesn't match
        if (selectedBrand !== 'all' && !dealer.brand.includes(selectedBrand)) {
            continue;
        }
        
        const distance = haversineMiles(zipLat, zipLng, dealer.lat, dealer.lng);
        
        if (distance < minDistance) {
            minDistance = distance;
            closest = { 
                dealer, 
                distance: distance.toFixed(1) // Format to 1 decimal place
            };
        }
    }
    
    return closest;
}

function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.style.display = 'block';
    
    // Auto-hide error after 5 seconds
    setTimeout(() => {
        el.style.display = 'none';
    }, 5000);
}

function hideError() {
    document.getElementById('errorMsg').style.display = 'none';
}

function handleSearch() {
    hideError();
    
    const zipInput = document.getElementById('zipInput');
    const brandSelect = document.getElementById('brandSelect');
    const resultDiv = document.getElementById('result');
    const loading = document.getElementById('loading');
    
    const zip = zipInput.value.trim();
    const selectedBrand = brandSelect.value;

    if (!/^\d{5}$/.test(zip)) {
        showError("Please enter a valid 5-digit ZIP code.");
        return;
    }
    
    if (!dataLoaded) {
        showError("Data is still loading. Please try again in a moment.");
        return;
    }
    
    if (!zipCentroids[zip]) {
        showError(`ZIP code ${zip} not found in our database.`);
        return;
    }
    
    loading.style.display = 'block';
    resultDiv.style.display = 'none';
    
    setTimeout(() => {
        try {
            const zipLoc = zipCentroids[zip];
            const closest = findClosestDealer(zipLoc.lat, zipLoc.lng, selectedBrand);
            
            if (!closest) {
                const brandText = selectedBrand === 'all' ? '' : `${selectedBrand} `;
                showError(`No ${brandText}dealerships found near ZIP ${zip}.`);
                loading.style.display = 'none';
                return;
            }
            
            document.getElementById('dealerName').textContent = closest.dealer.name;
            document.getElementById('distanceText').textContent = closest.distance;
            
            loading.style.display = 'none';
            resultDiv.style.display = 'block';
            
            updateMap(closest.dealer, zipLoc, zip);
            
        } catch (err) {
            console.error('Search error:', err);
            showError("An error occurred while searching. Please try again.");
            loading.style.display = 'none';
        }
    }, 100);
}

function updateMap(dealer, zipLoc, zip) {
    // Initialize map if needed, otherwise recenter
    if (!map) {
        initMap(dealer.lat, dealer.lng);
    } else {
        map.setView([dealer.lat, dealer.lng], 7);
    }
    
    if (markerA) map.removeLayer(markerA);
    if (markerB) map.removeLayer(markerB);
    if (polyline) map.removeLayer(polyline);
    
    markerA = L.marker([dealer.lat, dealer.lng], { 
        title: dealer.name,
        icon: L.divIcon({
            className: 'custom-marker marker-a',
            html: '🏆',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(map).bindPopup(`
        <b>🏆 Closest Dealership:</b><br>
        ${dealer.name}<br>
        <small>${dealer.brand.join(', ')}</small>
    `);
    
    markerB = L.marker([zipLoc.lat, zipLoc.lng], { 
        title: `ZIP: ${zip}`,
        icon: L.divIcon({
            className: 'custom-marker marker-b',
            html: '📍',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(map).bindPopup(`
        <b>Your Location:</b><br>
        ZIP: ${zip}
    `);
    
    polyline = L.polyline([
        [dealer.lat, dealer.lng],
        [zipLoc.lat, zipLoc.lng]
    ], {
        color: '#cc0000',
        weight: 3,
        opacity: 0.8,
        dashArray: '5, 5'
    }).addTo(map);
    
    const bounds = L.latLngBounds([
        [dealer.lat, dealer.lng],
        [zipLoc.lat, zipLoc.lng]
    ]);
    map.fitBounds(bounds.pad(0.3));
    
    markerA.openPopup();
}
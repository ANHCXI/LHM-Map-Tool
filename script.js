let map, routingControl, markerA, markerB;
let dealerships = [];
let zipCentroids = {};
let dataLoaded = false;

fetch('./data.json')
  .then(res => res.json())
  .then(data => {
    dealerships = data.dealerships;
    zipCentroids = data.zipCentroids;
    populateBrandDropdown();
    dataLoaded = true;
    checkReady();
  })
  .catch(err => {
    showError("⚠️ Could not load data.json. Make sure you're running a local server.");
    console.error(err);
  });

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

function checkReady() {
  const zip = document.getElementById('zipInput').value.trim();
  const btn = document.getElementById('goBtn');
  if (zip.length === 5 && dataLoaded && zipCentroids[zip]) {
    btn.disabled = false;
    btn.textContent = "Find Closest Dealership";
  }
}

document.getElementById('zipInput').addEventListener('input', (e) => {
  const zip = e.target.value.trim();
  const btn = document.getElementById('goBtn');
  if (zip.length === 5 && /^\d{5}$/.test(zip)) {
    if (dataLoaded && zipCentroids[zip]) {
      btn.disabled = false;
      btn.textContent = "Find Closest Dealership";
    } else if (dataLoaded) {
      btn.disabled = true;
      btn.textContent = "ZIP not in database";
    } else {
      btn.disabled = true;
      btn.textContent = "Loading data...";
    }
  } else {
    btn.disabled = true;
    btn.textContent = "Enter 5-digit ZIP";
  }
});

function initMap(lat, lng) {
  if (map) map.remove();
  map = L.map('map').setView([lat, lng], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(1);
}

function findClosestDealer(zipLat, zipLng, selectedBrand) {
  let closest = null;
  let minDistance = Infinity;
  
  dealerships.forEach(dealer => {
    if (selectedBrand !== 'all' && !dealer.brand.includes(selectedBrand)) {
      return;
    }
    const dist = parseFloat(haversineMiles(zipLat, zipLng, dealer.lat, dealer.lng));
    if (dist < minDistance) {
      minDistance = dist;
      closest = { dealer, distance: dist };
    }
  });
  return closest;
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

document.getElementById('goBtn').addEventListener('click', () => {
  const errorMsg = document.getElementById('errorMsg');
  const resultDiv = document.getElementById('result');
  const loading = document.getElementById('loading');
  
  errorMsg.style.display = 'none';
  resultDiv.style.display = 'none';
  loading.style.display = 'block';
  
  const zip = document.getElementById('zipInput').value.trim();
  const selectedBrand = document.getElementById('brandSelect').value;
  
  if (!/^\d{5}$/.test(zip)) {
    showError("Please enter a valid 5-digit ZIP code.");
    loading.style.display = 'none';
    return;
  }
  if (!zipCentroids[zip]) {
    showError(`ZIP ${zip} not found in database.`);
    loading.style.display = 'none';
    return;
  }
  
  setTimeout(() => {
    const zipLoc = zipCentroids[zip];
    const closest = findClosestDealer(zipLoc.lat, zipLoc.lng, selectedBrand);
    
    if (!closest) {
      showError(`No ${selectedBrand === 'all' ? '' : selectedBrand + ' '}dealerships found.`);
      loading.style.display = 'none';
      return;
    }
    
    document.getElementById('dealerName').textContent = closest.dealer.name;
    document.getElementById('distanceText').textContent = "Calculating route...";
    
    loading.style.display = 'none';
    resultDiv.style.display = 'block';
    
    if (!map) initMap(closest.dealer.lat, closest.dealer.lng);
    
    if (markerA) map.removeLayer(markerA);
    if (markerB) map.removeLayer(markerB);
    if (routingControl) map.removeControl(routingControl);
    
    markerA = L.marker([closest.dealer.lat, closest.dealer.lng], { title: closest.dealer.name }).addTo(map)
      .bindPopup(`<b>🏆 Closest:</b> ${closest.dealer.name}`).openPopup();
    markerB = L.marker([zipLoc.lat, zipLoc.lng], { title: `ZIP: ${zip}` }).addTo(map)
      .bindPopup(`<b>Your ZIP:</b> ${zip}`);
    
    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(zipLoc.lat, zipLoc.lng),
        L.latLng(closest.dealer.lat, closest.dealer.lng)
      ],
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: true,
      show: false,
      addWaypoints: false,
      draggableWaypoints: false,
      lineOptions: {
        styles: [{ color: '#cc0000', weight: 5, opacity: 0.9 }]
      },
      createMarker: function() { return null; }
    }).addTo(map);
    
    routingControl.on('routesfound', function(e) {
      const routes = e.routes;
      const summary = routes[0].summary;
      const drivingDistance = (summary.totalDistance / 1609.34).toFixed(1);
      const drivingTime = Math.round(summary.totalTime / 60);
      document.getElementById('distanceText').textContent = `${drivingDistance} miles (~${drivingTime} min)`;
    });
    
  }, 300);
});

document.getElementById('zipInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('goBtn').click();
});

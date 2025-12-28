const arrow = document.querySelector('.arrow');
const compass = document.querySelector('.compass');
const headingEl = document.getElementById('heading');
const enableBtn = document.getElementById('enableCompass');

let currentAngle = 0;
let usingSensors = false;

// Coordonnées de la cible (42°51'13.6"N 3°02'18.3"E converties en décimal)
const targetCoords = { lat: 42.851556, lon: 3.034500 };

// Variables pour position utilisateur et bearing cible
let userCoords = null;
let targetBearing = 0;

// Calculer la distance entre deux points GPS (en mètres)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Calculer l'angle vers la cible par rapport au Nord (bearing en degrés)
function getBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

// Surveiller la position GPS de l'utilisateur et mettre à jour targetBearing
if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition((position) => {
        userCoords = {
            lat: position.coords.latitude,
            lon: position.coords.longitude
        };
        targetBearing = getBearing(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
        const dist = getDistance(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
        if (headingEl) headingEl.textContent = `${Math.round(dist)} m`;
    }, (err) => {
        console.error('Erreur GPS:', err);
    }, { enableHighAccuracy: true });
}

function rotateTo(angle) {
    let angleDiff = angle - (currentAngle % 360);
    if (angleDiff > 180) angleDiff -= 360;
    else if (angleDiff < -180) angleDiff += 360;
    currentAngle += angleDiff;
    arrow.style.transform = `translateX(-50%) rotate(${currentAngle}deg)`;
}

function updateHeadingDisplay(h) {
    if (!headingEl) return;
    if (typeof h === 'number') headingEl.textContent = Math.round((h + 360) % 360) + '°';
    else headingEl.textContent = h;
}

function handleOrientationEvent(e) {
    let heading = null;
    if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        heading = e.webkitCompassHeading; // iOS devices
    } else if (e.alpha !== null) {
        // Préférer un calcul à partir de alpha/beta/gamma si disponibles
        if (e.beta !== undefined && e.gamma !== undefined && e.beta !== null && e.gamma !== null) {
            heading = getCompassHeading(e.alpha, e.beta, e.gamma);
        } else {
            heading = 360 - e.alpha; // fallback when only alpha is available
        }
    }
    if (heading !== null) {
        usingSensors = true;
        // Si on a la bearing de la cible (targetBearing) on calcule
        // l'angle relatif : direction cible - direction téléphone
        // puis on transforme en rotation écran (arrow pointe vers le sud par défaut)
        const deviceHeading = heading;
        const relative = ((targetBearing - deviceHeading) % 360 + 360) % 360; // 0..359
        const rotationToApply = relative - 180; // convert to arrow rotation
        rotateTo(rotationToApply);
        updateHeadingDisplay(deviceHeading);
    }
}

// Compute compass heading from deviceorientation Euler angles
function getCompassHeading(alpha, beta, gamma) {
    const degToRad = Math.PI / 180;
    const _alpha = alpha * degToRad;
    const _beta = beta * degToRad;
    const _gamma = gamma * degToRad;

    const cA = Math.cos(_alpha), sA = Math.sin(_alpha);
    const cB = Math.cos(_beta),  sB = Math.sin(_beta);
    const cG = Math.cos(_gamma), sG = Math.sin(_gamma);

    // Vx and Vy components (device -> earth frame)
    const Vx = - cA * sG - sA * sB * cG;
    const Vy = - sA * sG + cA * sB * cG;

    let bearing = Math.atan2(Vx, Vy) * 180 / Math.PI;
    if (bearing < 0) bearing += 360;
    return bearing;
}

function enableDeviceOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(permissionState => {
            if (permissionState === 'granted') {
                window.addEventListener('deviceorientation', handleOrientationEvent, true);
                enableBtn.style.display = 'none';
            } else {
                enableBtn.textContent = 'Permission refusée';
            }
        }).catch(err => {
            enableBtn.textContent = 'Erreur permission';
            console.error(err);
        });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
        window.addEventListener('deviceorientation', handleOrientationEvent, true);
        enableBtn.style.display = 'none';
    } else {
        enableBtn.textContent = 'Capteur non disponible';
    }
}

enableBtn.addEventListener('click', enableDeviceOrientation);

// Fallback to mouse if no sensors available
function onMouseMove(e) {
    const compassRect = compass.getBoundingClientRect();
    const compassX = compassRect.left + compassRect.width / 2;
    const compassY = compassRect.top + compassRect.height / 2;
    const angleRad = Math.atan2(e.clientY - compassY, e.clientX - compassX);
    const targetAngle = angleRad * (180 / Math.PI) + 90;
    // Même logique d'inversion que pour les capteurs
    rotateTo(180 - targetAngle);
    const deltaX = e.clientX - compassX;
    const deltaY = e.clientY - compassY;
    const distance = Math.round(Math.sqrt(deltaX * deltaX + deltaY * deltaY));
    updateHeadingDisplay(`${Math.round((currentAngle % 360 + 360) % 360)}° • ${distance}px`);
}

// If sensors don't become active quickly, enable mouse fallback (useful on desktop)
setTimeout(() => {
    if (!usingSensors) {
        document.addEventListener('mousemove', onMouseMove);
        updateHeadingDisplay('--');
    }
}, 1000);

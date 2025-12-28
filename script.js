const arrow = document.querySelector('.arrow');
const compass = document.querySelector('.compass');
const headingEl = document.getElementById('heading');
const distanceEl = document.getElementById('distance');
const enableBtn = document.getElementById('enableCompass');
const calibrateBtn = document.getElementById('calibrateBtn');
const resetCalibBtn = document.getElementById('resetCalibBtn');
const debugEl = document.getElementById('debug');

let currentAngle = 0;
let usingSensors = false;

// Coordonnées de la cible (42°51'13.6"N 3°02'18.3"E converties en décimal)
const targetCoords = { lat: 42.851556, lon: 3.034500 };

// Variables pour position utilisateur et bearing cible
let userCoords = null;
let targetBearing = 0;
let calibrationOffset = 0; // degrees to add to final rotation
let lastDeviceHeading = null;
let lastBaseRotation = null;

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
    // Compute compass heading from alpha/beta/gamma using rotation matrix
    // Returns heading in degrees (0 = north)
    function getCompassHeading(alpha, beta, gamma) {
        const degToRad = Math.PI / 180;
        const _alpha = alpha * degToRad; // z
        const _beta = beta * degToRad;   // x
        const _gamma = gamma * degToRad; // y

        const cA = Math.cos(_alpha), sA = Math.sin(_alpha);
        const cB = Math.cos(_beta),  sB = Math.sin(_beta);
        const cG = Math.cos(_gamma), sG = Math.sin(_gamma);

        // Rotation matrix components (device -> world)
        // Following Z (alpha), X (beta), Y (gamma) convention (Tait-Bryan ZXY)
        const m11 = cA * cG - sA * sB * sG;
        const m12 = -cB * sA;
        const m13 = cA * sG + cG * sA * sB;

        const m21 = cG * sA + cA * sB * sG;
        const m22 = cA * cB;
        const m23 = sA * sG - cA * cG * sB;

        const m31 = -cB * sG;
        const m32 = sB;
        const m33 = cB * cG;

        // Device Y axis (top of the device) in world coordinates is column 2
        const topX = m12;
        const topY = m22;

        // Project onto horizontal plane (ignore Z)
        let heading = Math.atan2(topX, topY) * 180 / Math.PI; // from north
        if (heading < 0) heading += 360;

        // Compensate for screen orientation
        const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
        heading = (heading - screenAngle + 360) % 360;

        return heading;
    }

    // Smooth angle interpolation (shortest path)
    function smoothAngle(prev, target, factor) {
        prev = ((prev % 360) + 360) % 360;
        target = ((target % 360) + 360) % 360;
        let delta = target - prev;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return prev + delta * factor;
    }
        const dist = getDistance(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
        if (distanceEl) distanceEl.textContent = `${Math.round(dist)} m`;
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
    // Prefer native compass if available (iOS), otherwise compute from alpha/beta/gamma
    let deviceHeading = null;
    let a = e.alpha, b = e.beta, g = e.gamma;
    if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        deviceHeading = e.webkitCompassHeading; // already compensated on iOS
    } else if (a !== null && b !== null && g !== null) {
        // Compute tilt-compensated heading using rotation matrix
        deviceHeading = getCompassHeading(a, b, g);
    } else if (a !== null) {
        deviceHeading = (360 - a) % 360; // best-effort fallback
    }

    if (deviceHeading !== null) {
        usingSensors = true;
        // compute relative bearing from device to target (0..359)
        const relative = ((targetBearing - deviceHeading) % 360 + 360) % 360;
        // base rotation to draw on screen (arrow graphic points down by default)
        const baseRotation = (relative + 180) % 360;
        lastDeviceHeading = deviceHeading;
        lastBaseRotation = baseRotation;

        // apply calibration offset
        const desiredRotation = ((baseRotation + calibrationOffset) % 360 + 360) % 360;

        // smoothing (low-pass) on angles
        const smoothFactor = 0.12; // lower = smoother
        const smoothed = smoothAngle(currentAngle % 360, desiredRotation, smoothFactor);

        rotateTo(smoothed);
        updateHeadingDisplay(deviceHeading);

        // Update debug with sensor values
        if (debugEl) {
            debugEl.style.display = 'block';
            const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
            debugEl.textContent = `deviceHeading: ${deviceHeading.toFixed(1)}°\n` +
                                  `targetBearing: ${targetBearing.toFixed(1)}°\n` +
                                  `baseRotation: ${baseRotation.toFixed(1)}°\n` +
                                  `calibrationOffset: ${calibrationOffset.toFixed(1)}°\n` +
                                  `appliedRotation: ${((smoothed%360)+360)%360 .toFixed(1)}°\n` +
                                  `screenAngle: ${screenAngle}°\n` +
                                  `alpha: ${a.toFixed(1)}°, beta: ${b.toFixed(1)}°, gamma: ${g.toFixed(1)}°\n` +
                                  `userCoords: ${userCoords ? userCoords.lat.toFixed(6) + ',' + userCoords.lon.toFixed(6) : 'n/a'}`;
        }
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

// Calibrate button: when user points phone physically toward the real target
// and clicks "Calibrer", we set calibrationOffset so arrow aligns with that
// physical direction (i.e. sets appliedRotation → baseRotation + offset = 0).
if (calibrateBtn) {
    calibrateBtn.addEventListener('click', () => {
        if (lastBaseRotation == null) return;
        // we want (baseRotation + calibrationOffset) %360 === 0
        calibrationOffset = ((0 - lastBaseRotation) % 360 + 360) % 360;
        if (debugEl) debugEl.textContent += `\nCalibrated: offset=${calibrationOffset.toFixed(1)}°`;
    });
}

if (resetCalibBtn) {
    resetCalibBtn.addEventListener('click', () => {
        calibrationOffset = 0;
        if (debugEl) debugEl.textContent += '\nCalibration reset';
    });
}

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

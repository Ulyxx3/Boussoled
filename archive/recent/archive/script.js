const arrow = document.querySelector('.arrow');
const compass = document.querySelector('.compass');
const headingEl = document.getElementById('heading');
const distanceEl = document.getElementById('distance');
const enableBtn = document.getElementById('enableCompass');
const calibrateBtn = document.getElementById('calibrateBtn');
const resetCalibBtn = document.getElementById('resetCalibBtn');
const debugEl = document.getElementById('debug');

let currentAngle = 0; // current drawn rotation (degrees)
let usingSensors = false;
let calibrationOffset = 0; // degrees added to final rotation
let lastDeviceHeading = null;
let northArrow = document.querySelector('.north-arrow');
let northCurrentAngle = 0;

// Remove GPS logic: this script points to true north only
if (distanceEl) distanceEl.textContent = '-- m';

// --- Rotation & smoothing helpers ---------------------------------------
function normalize360(a){ return ((a % 360) + 360) % 360; }

// Smooth angle interpolation (shortest path)
function smoothAngle(prev, target, factor) {
    prev = normalize360(prev);
    target = normalize360(target);
    let delta = target - prev;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return prev + delta * factor;
}

function rotateTo(angle) {
    // angle is in degrees (can be fractional)
    let angleDiff = angle - (currentAngle % 360);
    if (angleDiff > 180) angleDiff -= 360;
    else if (angleDiff < -180) angleDiff += 360;
    currentAngle += angleDiff;
    arrow.style.transform = `translateX(-50%) rotate(${currentAngle}deg)`;
}

function updateHeadingDisplay(h) {
    if (!headingEl) return;
    if (typeof h === 'number') headingEl.textContent = Math.round(normalize360(h)) + '°';
    else headingEl.textContent = h;
}

// --- Orientation -> world-heading (rotation matrix approach) ------------
// Convert DeviceOrientation alpha,beta,gamma (deg) to a tilt-compensated heading (0=north)
function getCompassHeading(alpha, beta, gamma) {
    // degrees to radians
    const a = alpha * Math.PI/180; // z
    const b = beta  * Math.PI/180; // x
    const g = gamma * Math.PI/180; // y

    // Rotation matrices: Rz(alpha) * Rx(beta) * Ry(gamma)
    // Compute composite rotation matrix elements
    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);

    // R = Rz * Rx * Ry
    const m11 = ca*cg - sa*sb*sg;
    const m12 = -ca*sg - sa*sb*cg;
    const m13 = -sa*cb;

    const m21 = sa*cg + ca*sb*sg;
    const m22 = -sa*sg + ca*sb*cg;
    const m23 = ca*cb;

    const m31 = cb*sg;
    const m32 = cb*cg;
    const m33 = -sb;

    // Device coordinate axes: X right, Y up (top), Z out of screen.
    // The device 'forward/top' vector (pointing towards top of device) in world coords is column 2 of R^T,
    // which equals (m12, m22, m32) using the above construction.
    const topX = m12;
    const topY = m22;
    const topZ = m32; // vertical component

    // Project onto horizontal plane (ignore vertical)
    // World axes: X east, Y north. Compute azimuth from north.
    let heading = Math.atan2(topX, topY) * 180 / Math.PI; // radians -> deg
    if (heading < 0) heading += 360;

    // Account for screen orientation (portrait/landscape)
    const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
    heading = normalize360(heading - screenAngle);

    return heading;
}

// --- Handle deviceorientation events -----------------------------------
function handleOrientationEvent(e) {
    // Read raw values (may be null on some devices)
    const a = (typeof e.alpha === 'number') ? e.alpha : null;
    const b = (typeof e.beta === 'number') ? e.beta : null;
    const g = (typeof e.gamma === 'number') ? e.gamma : null;

    // Prefer native compass heading on iOS
    let deviceHeading = null;
    if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        deviceHeading = e.webkitCompassHeading; // in degrees, 0=north
    } else if (a !== null && b !== null && g !== null) {
        deviceHeading = getCompassHeading(a, b, g);
    } else if (a !== null) {
        deviceHeading = normalize360(360 - a);
    }

    if (deviceHeading === null) return;

    usingSensors = true;

    // For north-only behaviour: compute the arrow rotation so the red arrow points to geographic north
    lastDeviceHeading = deviceHeading;
    // arrow graphic points down by default: arrowRotation = 180 - deviceHeading
    let baseRotation = normalize360(180 - deviceHeading);
    // Apply calibration offset (user can calibrate if needed)
    const desiredRotation = normalize360(baseRotation + calibrationOffset);
    const smoothFactor = 0.12;
    const smoothed = smoothAngle(currentAngle % 360, desiredRotation, smoothFactor);
    rotateTo(smoothed);
    updateHeadingDisplay(deviceHeading);

    // North needle: show true north (no calibration applied)
    if (northArrow) {
        const northDesired = normalize360(180 - deviceHeading);
        const northSmoothed = smoothAngle(northCurrentAngle, northDesired, smoothFactor);
        northCurrentAngle = northSmoothed;
        northArrow.style.transform = `translateX(-50%) rotate(${northSmoothed}deg)`;
    }

    // Debug info
    if (debugEl) {
        debugEl.style.display = 'block';
        const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
        debugEl.textContent = `deviceHeading: ${deviceHeading.toFixed(1)}°\n` +
                              `targetBearing: ${targetBearing.toFixed(1)}°\n` +
                              `baseRotation: ${baseRotation.toFixed(1)}°\n` +
                              `calibrationOffset: ${calibrationOffset.toFixed(1)}°\n` +
                              `appliedRotation: ${normalize360(smoothed).toFixed(1)}°\n` +
                              `screenAngle: ${screenAngle}°\n` +
                              `alpha: ${a!==null?a.toFixed(1):'n/a'}°, beta: ${b!==null?b.toFixed(1):'n/a'}°, gamma: ${g!==null?g.toFixed(1):'n/a'}°\n` +
                              `userCoords: ${userCoords?userCoords.lat.toFixed(6)+','+userCoords.lon.toFixed(6):'n/a'}`;
    }
}

// --- Enable orientation (permission flow + fallback) --------------------
function enableDeviceOrientation() {
    try { enableBtn.disabled = true; enableBtn.textContent = 'Demande permission...'; } catch(e){}

    const onSuccessAttach = () => {
        try { enableBtn.textContent = 'Activée'; enableBtn.style.display = 'none'; } catch(e){}
        console.log('DeviceOrientation listener attached');
    };
    const onFailAttach = (msg) => {
        try { enableBtn.disabled = false; enableBtn.textContent = msg || 'Activation échouée'; } catch(e){}
        if (debugEl) { debugEl.style.display = 'block'; debugEl.textContent = 'Activation error: ' + (msg || 'unknown'); }
        console.warn('DeviceOrientation attach failed:', msg);
    };

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(permissionState => {
            if (permissionState === 'granted') {
                window.addEventListener('deviceorientation', handleOrientationEvent, true);
                window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
                onSuccessAttach();
            } else {
                onFailAttach('Permission refusée');
            }
        }).catch(err => { console.error(err); onFailAttach('Erreur permission'); });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
        // attach and wait briefly
        window.addEventListener('deviceorientation', handleOrientationEvent, true);
        window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
        setTimeout(() => { if (!usingSensors) onFailAttach("Pas d'événements capteurs reçus"); }, 1200);
        onSuccessAttach();
    } else {
        onFailAttach('Capteur non disponible');
    }
}

enableBtn.addEventListener('click', enableDeviceOrientation);

// --- Calibration controls -----------------------------------------------
if (calibrateBtn) {
    calibrateBtn.addEventListener('click', () => {
        if (lastDeviceHeading == null) return;
        // Set calibration so arrow points to true north when pressed (user should physically face north first)
        // baseRotation = 180 - deviceHeading ; we want baseRotation + offset === 0 => offset = deviceHeading - 180
        calibrationOffset = normalize360(lastDeviceHeading - 180);
        if (debugEl) debugEl.textContent += `\nCalibrated: offset=${calibrationOffset.toFixed(1)}°`;
    });
}
if (resetCalibBtn) {
    resetCalibBtn.addEventListener('click', () => { calibrationOffset = 0; if (debugEl) debugEl.textContent += '\nCalibration reset'; });
}

// --- Mouse fallback ----------------------------------------------------
function onMouseMove(e) {
    const compassRect = compass.getBoundingClientRect();
    const compassX = compassRect.left + compassRect.width/2;
    const compassY = compassRect.top + compassRect.height/2;
    const angleRad = Math.atan2(e.clientY - compassY, e.clientX - compassX);
    const targetAngle = angleRad * 180 / Math.PI + 90;
    // simulate baseRotation logic (targetAngle is screen angle to mouse)
    const baseRotation = normalize360(targetAngle + 180);
    const desired = normalize360(baseRotation + calibrationOffset);
    const smoothed = smoothAngle(currentAngle % 360, desired, 0.2);
    rotateTo(smoothed);
    if (northArrow) {
        const northDesired = 180; // assume top of screen == north for mouse fallback
        const northSmoothed = smoothAngle(northCurrentAngle, northDesired, 0.2);
        northCurrentAngle = northSmoothed;
        northArrow.style.transform = `translateX(-50%) rotate(${northSmoothed}deg)`;
    }
    const deltaX = e.clientX - compassX, deltaY = e.clientY - compassY;
    const distance = Math.round(Math.sqrt(deltaX*deltaX + deltaY*deltaY));
    updateHeadingDisplay(`${Math.round(normalize360(currentAngle))}° • ${distance}px`);
}

setTimeout(() => { if (!usingSensors) { document.addEventListener('mousemove', onMouseMove); updateHeadingDisplay('--'); } }, 1000);

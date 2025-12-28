const arrow = document.querySelector('.arrow');
const compass = document.querySelector('.compass');
const headingEl = document.getElementById('heading');
const enableBtn = document.getElementById('enableCompass');

let currentAngle = 0;
let usingSensors = false;

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
        // L'aiguille dans le CSS pointe vers le bas par défaut,
        // on ajoute 180° pour qu'elle pointe vers le nord réel.
        rotateTo(heading + 180);
        updateHeadingDisplay(heading);
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
    // Même compensation que pour les capteurs : ajouter 180°
    rotateTo(targetAngle + 180);
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

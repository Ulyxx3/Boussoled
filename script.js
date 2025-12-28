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
        heading = 360 - e.alpha; // fallback for many Android browsers
    }
    if (heading !== null) {
        usingSensors = true;
        // L'aiguille dans le CSS pointe vers le bas par défaut,
        // on ajoute 180° pour qu'elle pointe vers le nord réel.
        rotateTo(heading + 180);
        updateHeadingDisplay(heading);
    }
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

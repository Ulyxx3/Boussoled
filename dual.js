(function(){
  'use strict';

  // DOM nodes will be queried on init to avoid timing issues on mobile
  let arrow, compass, headingEl, distanceEl, enableBtn, calibrateBtn, resetCalibBtn, debugEl, northArrow, debugToggleBtn;

  // target coords (example)
  const targetCoords = { lat: 42.851556, lon: 3.034500 };

  let currentAngle = 0;
  let northCurrentAngle = 0;
  let usingSensors = false;
  let calibrationOffset = 0; // for red arrow
  let lastDeviceHeading = null;
  let lastBaseRotation = null;

  // GPS
  let userCoords = null;
  let targetBearing = 0;

  // utils
  function normalize360(a){ return ((a % 360) + 360) % 360; }
  function smoothAngle(prev, target, factor) {
    prev = normalize360(prev);
    target = normalize360(target);
    let delta = target - prev;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return prev + delta * factor;
  }
  function rotateTo(angle) {
    let angleDiff = angle - (currentAngle % 360);
    if (angleDiff > 180) angleDiff -= 360;
    else if (angleDiff < -180) angleDiff += 360;
    currentAngle += angleDiff;
    if (arrow) arrow.style.transform = `translateX(-50%) rotate(${currentAngle}deg)`;
  }
  function updateHeadingDisplay(h) {
    if (!headingEl) return;
    if (typeof h === 'number') headingEl.textContent = Math.round(normalize360(h)) + '°';
    else headingEl.textContent = h;
  }

  // geolocation helpers
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180; const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  function getBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180; const Δλ = (lon2-lon1) * Math.PI/180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  // rotation-matrix heading (tilt-compensated)
  function getCompassHeading(alpha, beta, gamma) {
    const a = alpha * Math.PI/180;
    const b = beta * Math.PI/180;
    const g = gamma * Math.PI/180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);
    const m11 = ca*cg - sa*sb*sg;
    const m12 = -ca*sg - sa*sb*cg;
    const m13 = -sa*cb;
    const m21 = sa*cg + ca*sb*sg;
    const m22 = -sa*sg + ca*sb*cg;
    const m23 = ca*cb;
    const m31 = cb*sg;
    const m32 = cb*cg;
    const m33 = -sb;
    const topX = m12;
    const topY = m22;
    let heading = Math.atan2(topX, topY) * 180 / Math.PI;
    if (heading < 0) heading += 360;
    const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
    heading = normalize360(heading - screenAngle);
    return heading;
  }

  // parse rotation angle (radians) from computed transform string
  function parseRotationFromTransform(transformStr) {
    if (!transformStr || transformStr === 'none') return 0;
    // 2D matrix: matrix(a, b, c, d, tx, ty)
    const m2 = transformStr.match(/matrix\(([^)]+)\)/);
    if (m2) {
      const vals = m2[1].split(',').map(s => parseFloat(s));
      const a = vals[0], b = vals[1];
      return Math.atan2(b, a);
    }
    // 3D matrix: matrix3d(...16 values...)
    const m3 = transformStr.match(/matrix3d\(([^)]+)\)/);
    if (m3) {
      const vals = m3[1].split(',').map(s => parseFloat(s));
      const a = vals[0], b = vals[1];
      return Math.atan2(b, a);
    }
    return 0;
  }

  // orientation event
  function handleOrientationEvent(e) {
    const a = (typeof e.alpha === 'number') ? e.alpha : null;
    const b = (typeof e.beta === 'number') ? e.beta : null;
    const g = (typeof e.gamma === 'number') ? e.gamma : null;

    let deviceHeading = null;
    if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
      deviceHeading = e.webkitCompassHeading;
    } else if (a !== null && b !== null && g !== null) {
      deviceHeading = getCompassHeading(a,b,g);
    } else if (a !== null) {
      deviceHeading = normalize360(360 - a);
    }
    if (deviceHeading === null) return;

    usingSensors = true;
    lastDeviceHeading = deviceHeading;

    // north needle (blue) always points to geographic north
    const northDesired = normalize360(180 - deviceHeading);
    northCurrentAngle = smoothAngle(northCurrentAngle, northDesired, 0.12);
    if (northArrow) northArrow.style.transform = `translateX(-50%) rotate(${northCurrentAngle}deg)`;

    // red needle: depending on mode
    const mode = localStorage.getItem('compassMode') || 'north';
    let baseRotation;
    if (mode === 'gps' && userCoords) {
      // compute relative bearing to target
      targetBearing = getBearing(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
      const relative = normalize360(targetBearing - deviceHeading);
      baseRotation = normalize360(relative + 180);
    } else {
      // point to north
      baseRotation = normalize360(180 - deviceHeading);
    }
    lastBaseRotation = baseRotation;
    const desiredRotation = normalize360(baseRotation + calibrationOffset);
    const smoothed = smoothAngle(currentAngle % 360, desiredRotation, 0.12);
    rotateTo(smoothed);
    updateHeadingDisplay(deviceHeading);

    if (debugEl) {
      debugEl.style.display = 'block';
      const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
      debugEl.textContent = `deviceHeading: ${deviceHeading.toFixed(1)}°\n` +
                            `targetBearing: ${typeof targetBearing === 'number'?targetBearing.toFixed(1)+'°':'n/a'}\n` +
                            `baseRotation: ${baseRotation.toFixed(1)}°\n` +
                            `calibrationOffset: ${calibrationOffset.toFixed(1)}°\n` +
                            `appliedRotation: ${normalize360(smoothed).toFixed(1)}°\n` +
                            `screenAngle: ${screenAngle}°\n` +
                            `alpha: ${a!==null?a.toFixed(1):'n/a'}°, beta: ${b!==null?b.toFixed(1):'n/a'}°, gamma: ${g!==null?g.toFixed(1):'n/a'}°\n` +
                            `userCoords: ${userCoords?userCoords.lat.toFixed(6)+','+userCoords.lon.toFixed(6):'n/a'}`;
    }
  }

  // enable device orientation
  function enableDeviceOrientation() {
    try { if (enableBtn) { enableBtn.disabled = true; enableBtn.textContent = 'Demande permission...'; } } catch(e){}
    const onSuccessAttach = () => { try { enableBtn.textContent = 'Activée'; enableBtn.style.display = 'none'; } catch(e){} };
    const onFailAttach = (msg) => { try { enableBtn.disabled = false; enableBtn.textContent = msg || 'Activation échouée'; } catch(e){} if (debugEl) { debugEl.style.display = 'block'; debugEl.textContent = 'Activation error: ' + (msg || 'unknown'); } };

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientationEvent, true);
          window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
          onSuccessAttach();
        } else onFailAttach('Permission refusée');
      }).catch(err => { console.error(err); onFailAttach('Erreur permission'); });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientation', handleOrientationEvent, true);
      window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
      setTimeout(() => { if (!usingSensors) onFailAttach("Pas d'événements capteurs reçus"); }, 1200);
      onSuccessAttach();
    } else onFailAttach('Capteur non disponible');
  }

  // Initialize after DOM ready to ensure elements exist (mobile reliability)
  function init() {
    arrow = document.querySelector('.arrow');
    compass = document.querySelector('.compass');
    headingEl = document.getElementById('heading');
    distanceEl = document.getElementById('distance');
    enableBtn = document.getElementById('enableCompass');
    calibrateBtn = document.getElementById('calibrateBtn');
    resetCalibBtn = document.getElementById('resetCalibBtn');
    debugEl = document.getElementById('debug');
    northArrow = document.querySelector('.north-arrow');
    debugToggleBtn = document.getElementById('debugToggle');

    if (enableBtn) enableBtn.addEventListener('click', enableDeviceOrientation);
    if (calibrateBtn) calibrateBtn.addEventListener('click', () => {
      if (lastBaseRotation == null) return;
      calibrationOffset = normalize360(0 - lastBaseRotation);
      if (debugEl) debugEl.textContent += `\nCalibrated: offset=${calibrationOffset.toFixed(1)}°`;
    });
    if (resetCalibBtn) resetCalibBtn.addEventListener('click', () => { calibrationOffset = 0; if (debugEl) debugEl.textContent += '\nCalibration reset'; });
    if (debugToggleBtn) debugToggleBtn.addEventListener('click', () => {
      if (!debugEl) return;
      debugEl.style.display = (debugEl.style.display === 'block') ? 'none' : 'block';
    });

    // geolocation watch (start after DOM ready for better prompt behavior)
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition((position) => {
        userCoords = { lat: position.coords.latitude, lon: position.coords.longitude };
        targetBearing = getBearing(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
        const dist = getDistance(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
        if (distanceEl) distanceEl.textContent = `${Math.round(dist)} m`;
      }, (err) => {
        console.error('Erreur GPS:', err);
        if (distanceEl) distanceEl.textContent = 'GPS erreur';
      }, { enableHighAccuracy: true });
    } else {
      if (distanceEl) distanceEl.textContent = 'Geoloc non dispo';
    }

    // mouse fallback
    setTimeout(() => { if (!usingSensors) { document.addEventListener('mousemove', onMouseMove); updateHeadingDisplay('--'); } }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // calibration
  if (calibrateBtn) {
    calibrateBtn.addEventListener('click', () => {
      if (lastBaseRotation == null) return;
      calibrationOffset = normalize360(0 - lastBaseRotation);
      if (debugEl) debugEl.textContent += `\nCalibrated: offset=${calibrationOffset.toFixed(1)}°`;
    });
  }
  if (resetCalibBtn) {
    resetCalibBtn.addEventListener('click', () => { calibrationOffset = 0; if (debugEl) debugEl.textContent += '\nCalibration reset'; });
  }

  // mouse fallback
  function onMouseMove(e) {
    const compassRect = compass.getBoundingClientRect();
    const compassX = compassRect.left + compassRect.width/2;
    const compassY = compassRect.top + compassRect.height/2;
    const angleRad = Math.atan2(e.clientY - compassY, e.clientX - compassX);
    const targetAngle = angleRad * 180 / Math.PI + 90;
    const baseRotation = normalize360(targetAngle + 180);
    const desired = normalize360(baseRotation + calibrationOffset);
    const smoothed = smoothAngle(currentAngle % 360, desired, 0.2);
    rotateTo(smoothed);
    // north arrow assume up == north for mouse fallback
    if (northArrow) {
      const northSmoothed = smoothAngle(northCurrentAngle, 180, 0.2);
      northCurrentAngle = northSmoothed;
      northArrow.style.transform = `translateX(-50%) rotate(${northSmoothed}deg)`;
    }
    const deltaX = e.clientX - compassX, deltaY = e.clientY - compassY;
    const distance = Math.round(Math.sqrt(deltaX*deltaX + deltaY*deltaY));
    updateHeadingDisplay(`${Math.round(normalize360(currentAngle))}° • ${distance}px`);
  }

  setTimeout(() => { if (!usingSensors) { document.addEventListener('mousemove', onMouseMove); updateHeadingDisplay('--'); } }, 1000);

})();

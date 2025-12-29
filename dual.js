(function(){
  'use strict';

  // DOM nodes will be queried on init to avoid timing issues on mobile
  let arrow, compass, headingEl, distanceEl, enableBtn, debugEl;

  // target coords (example)
  const targetCoords = { lat: 42.851556, lon: 3.034500 };

  let currentAngle = 0;
  let usingSensors = false;

  // GPS
  let userCoords = null;
  let targetBearing = 0;

  // Expose currentAngle globally so nebula.js can read it
  window.compassAngle = 0;

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
    // Keep global angle in sync for nebula.js to read
    window.compassAngle = currentAngle;
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

  // orientation event - GPS-only: always point to target
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

    // GPS-only: always point to target bearing
    if (userCoords) {
      targetBearing = getBearing(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
      const relative = normalize360(targetBearing - deviceHeading);
      const baseRotation = normalize360(relative + 180);
      const smoothed = smoothAngle(currentAngle % 360, baseRotation, 0.12);
      rotateTo(smoothed);
      updateHeadingDisplay(targetBearing);

      if (debugEl && debugEl.style.display === 'block') {
        const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
        debugEl.textContent = `deviceHeading: ${deviceHeading.toFixed(1)}°\n` +
                              `targetBearing: ${targetBearing.toFixed(1)}°\n` +
                              `baseRotation: ${baseRotation.toFixed(1)}°\n` +
                              `screenAngle: ${screenAngle}°\n` +
                              `alpha: ${a!==null?a.toFixed(1):'n/a'}°, beta: ${b!==null?b.toFixed(1):'n/a'}°, gamma: ${g!==null?g.toFixed(1):'n/a'}°\n` +
                              `userCoords: ${userCoords.lat.toFixed(6)},${userCoords.lon.toFixed(6)}`;
      }
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
    debugEl = document.getElementById('debug');

    if (enableBtn) enableBtn.addEventListener('click', enableDeviceOrientation);

    // geolocation watch (start after DOM ready for better prompt behavior)
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition((position) => {
        userCoords = { lat: position.coords.latitude, lon: position.coords.longitude };
        const dist = getDistance(userCoords.lat, userCoords.lon, targetCoords.lat, targetCoords.lon);
        if (distanceEl) distanceEl.textContent = `${Math.round(dist)} m`;
      }, (err) => {
        console.error('GPS error:', err);
        if (distanceEl) distanceEl.textContent = 'GPS off';
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 });
    } else {
      if (distanceEl) distanceEl.textContent = 'No geolocation';
    }

    // mouse fallback
    setTimeout(() => { if (!usingSensors) { document.addEventListener('mousemove', onMouseMove); updateHeadingDisplay('0°'); } }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // mouse fallback (desktop testing only)
  function onMouseMove(e) {
    const compassRect = compass.getBoundingClientRect();
    const compassX = compassRect.left + compassRect.width/2;
    const compassY = compassRect.top + compassRect.height/2;
    const angleRad = Math.atan2(e.clientY - compassY, e.clientX - compassX);
    const targetAngle = angleRad * 180 / Math.PI + 90;
    const smoothed = smoothAngle(currentAngle % 360, targetAngle, 0.2);
    rotateTo(smoothed);
  }

})();

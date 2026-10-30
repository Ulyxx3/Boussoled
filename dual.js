/**
 * ==============================================================================
 * DUAL.JS - GESTION DU GPS, DE L'ORIENTATION, DU CADRAN N/S ET DES MODES
 * ==============================================================================
 * Ce script assure les fonctionnalités suivantes :
 * 1. Détection de l'appareil : Mobile vs Ordinateur (Desktop).
 * 2. Comportement sur PC :
 *    - AVANT activation : mode souris libre, la nébuleuse suit le curseur.
 *    - APRÈS activation : la nébuleuse et le cadran s'orientent vers la cible.
 * 3. Comportement sur Mobile :
 *    - AVANT activation : la nébuleuse est au repos ('idle', sphère 3D pure).
 *    - APRÈS activation : capteurs gyroscopiques + GPS, la nébuleuse pointe
 *      vers l'objectif et le cadran (Nord/Sud) s'aligne avec le Nord magnétique.
 * 4. Cadran rotatif minimaliste :
 *    - 'N' (Nord) pointe vers le Nord réel.
 *    - 'S' (Sud) pointe vers le Sud.
 *    - La nébuleuse pointe vers l'objectif à atteindre.
 * 5. Calculs géodésiques (Haversine & Azimut) et synchronisation du slider de couleur.
 * ==============================================================================
 */

(function () {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. DÉFINITION DE LA CIBLE & VARIABLES GLOBALES
    // --------------------------------------------------------------------------

    /**
     * Coordonnées GPS de l'objectif à atteindre (ex: Le Havre, France).
     */
    const TARGET_COORDS = {
        lat: 49.4978605, // Latitude : 49°29'51.61" N
        lon: 0.1327079   // Longitude : 0°07'56.78" E
    };

    // Détection de l'appareil (Mobile / Tablette vs Ordinateur de bureau)
    const isMobileDevice = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                          ('ontouchstart' in window && navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

    // Éléments du DOM
    let compassContainer = null;
    let compassDial = null;
    let distanceValEl = null;
    let enableBtn = null;
    let gpsStatusEl = null;
    let colorSlider = null;
    let arrowEl = null;
    let debugEl = null;

    // État de l'application
    let isCompassActive = false;      // Si la boussole a été activée
    let userCoords = null;           // Position GPS actuelle { lat, lon }
    let currentAngle = 0;             // Angle courant de la nébuleuse (direction cible)
    let currentDialAngle = 0;         // Angle courant du cadran Nord / Sud
    let usingSensors = false;         // Vrai si des données de gyroscope réel sont reçues

    // Variable partagée globalement pour orienter la nébuleuse dans nebula.js
    window.compassAngle = 0;

    // --------------------------------------------------------------------------
    // 2. UTILITAIRES MATHÉMATIQUES & LISSAGE ANGULAIRE
    // --------------------------------------------------------------------------

    /**
     * Normalise un angle pour qu'il soit toujours dans l'intervalle [0, 360[.
     * @param {number} angle - Angle en degrés
     * @returns {number} Angle normalisé
     */
    function normalize360(angle) {
        return ((angle % 360) + 360) % 360;
    }

    /**
     * Interpolation douce (lerp) entre deux angles en choisissant le plus court chemin.
     * @param {number} prev - Angle précédent
     * @param {number} target - Angle cible
     * @param {number} factor - Facteur de lissage (entre 0 et 1)
     * @returns {number} Nouvel angle lissé
     */
    function smoothAngle(prev, target, factor) {
        prev = normalize360(prev);
        target = normalize360(target);
        let delta = target - prev;
        
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        
        return prev + delta * factor;
    }

    /**
     * Fait pivoter la nébuleuse vers un angle donné.
     * @param {number} angle - Angle en degrés
     */
    function rotateNebulaTo(angle) {
        let diff = angle - (currentAngle % 360);
        if (diff > 180) diff -= 360;
        else if (diff < -180) diff += 360;
        currentAngle += diff;

        window.compassAngle = currentAngle;

        if (arrowEl) {
            arrowEl.style.transform = `translate(-50%, -50%) rotate(${currentAngle}deg)`;
        }
    }

    /**
     * Fait pivoter le cadran Nord/Sud pour refléter le cap magnétique.
     * @param {number} angle - Angle du cadran en degrés
     */
    function rotateDialTo(angle) {
        if (!compassDial) return;
        let diff = angle - (currentDialAngle % 360);
        if (diff > 180) diff -= 360;
        else if (diff < -180) diff += 360;
        currentDialAngle += diff;

        compassDial.style.transform = `rotate(${currentDialAngle}deg)`;
    }

    // --------------------------------------------------------------------------
    // 3. CALCULS GÉODÉSIQUES : FORMULE DE HAVERSINE & AZIMUT
    // --------------------------------------------------------------------------

    /**
     * Calcule la distance orthodromique entre deux points GPS en mètres.
     */
    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Rayon terrestre moyen
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
                  
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Calcule le gisement (bearing initial) vers la cible en degrés [0, 360[.
     */
    function getBearing(lat1, lon1, lat2, lon2) {
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const y = Math.sin(deltaLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) -
                  Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }

    /**
     * Affiche la distance restante de façon épurée.
     * @param {number|null} meters - Distance en mètres
     */
    function updateDistanceDisplay(meters) {
        if (!distanceValEl) return;
        
        if (meters === null || isNaN(meters)) {
            distanceValEl.textContent = '--';
            return;
        }

        const rounded = Math.round(meters);
        distanceValEl.textContent = rounded.toLocaleString('fr-FR');
    }

    // --------------------------------------------------------------------------
    // 4. COMPENSATION D'INCLINAISON 3D POUR SMARTPHONE
    // --------------------------------------------------------------------------

    /**
     * Calcule le cap réel par rapport au Nord à partir des capteurs mobiles.
     */
    function getCompassHeading(alpha, beta, gamma) {
        const a = alpha * Math.PI / 180;
        const b = beta * Math.PI / 180;
        const g = gamma * Math.PI / 180;

        const ca = Math.cos(a), sa = Math.sin(a);
        const cb = Math.cos(b), sb = Math.sin(b);
        const cg = Math.cos(g), sg = Math.sin(g);

        const m12 = -ca * sg - sa * sb * cg;
        const m22 = -sa * sg + ca * sb * cg;

        let heading = Math.atan2(m12, m22) * 180 / Math.PI;
        if (heading < 0) heading += 360;

        const screenAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
        return normalize360(heading - screenAngle);
    }

    /**
     * Traite les événements gyroscopiques de l'appareil mobile.
     */
    function handleOrientationEvent(e) {
        if (!isCompassActive) return;

        const a = (typeof e.alpha === 'number') ? e.alpha : null;
        const b = (typeof e.beta === 'number') ? e.beta : null;
        const g = (typeof e.gamma === 'number') ? e.gamma : null;

        let deviceHeading = null;

        // iOS
        if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
            deviceHeading = e.webkitCompassHeading;
        } 
        // Android
        else if (a !== null && b !== null && g !== null) {
            deviceHeading = getCompassHeading(a, b, g);
        } else if (a !== null) {
            deviceHeading = normalize360(360 - a);
        }

        if (deviceHeading === null) return;

        usingSensors = true;

        // 1. Le cadran Nord/Sud tourne pour que 'N' pointe toujours vers le Nord physique
        // L'angle du cadran est l'inverse de la rotation du téléphone (-deviceHeading)
        const smoothedDial = smoothAngle(currentDialAngle % 360, 360 - deviceHeading, 0.15);
        rotateDialTo(smoothedDial);

        // 2. La nébuleuse pointe vers la cible par rapport à l'orientation du téléphone
        if (userCoords) {
            const targetBearing = getBearing(userCoords.lat, userCoords.lon, TARGET_COORDS.lat, TARGET_COORDS.lon);
            const relativeToTarget = normalize360(targetBearing - deviceHeading);
            const smoothedNebula = smoothAngle(currentAngle % 360, relativeToTarget, 0.15);
            rotateNebulaTo(smoothedNebula);
        } else {
            // Si pas encore de position GPS, la nébuleuse s'aligne avec le Nord
            const relativeToNorth = normalize360(360 - deviceHeading);
            const smoothedNebula = smoothAngle(currentAngle % 360, relativeToNorth, 0.15);
            rotateNebulaTo(smoothedNebula);
        }
    }

    // --------------------------------------------------------------------------
    // 5. GESTION DE L'ACTIVATION DE LA BOUSSOLE (DESKTOP VS MOBILE)
    // --------------------------------------------------------------------------

    /**
     * Active le mode boussole.
     */
    function activateCompass() {
        isCompassActive = true;

        // Met la nébuleuse en mode 'compass'
        if (window.nebulaSphere && typeof window.nebulaSphere.setMode === 'function') {
            window.nebulaSphere.setMode('compass');
        }

        if (isMobileDevice) {
            // Sur mobile : activation des capteurs réels
            if (enableBtn) {
                enableBtn.disabled = true;
                enableBtn.textContent = 'Connexion...';
            }

            const onSuccess = () => {
                if (enableBtn) {
                    enableBtn.classList.add('hidden'); // Disparaît pour le minimalisme
                }
            };

            const onFail = (msg) => {
                if (enableBtn) {
                    enableBtn.disabled = false;
                    enableBtn.textContent = msg || 'Activer la boussole';
                }
            };

            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(state => {
                        if (state === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientationEvent, true);
                            window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
                            onSuccess();
                        } else {
                            onFail('Permission refusée');
                        }
                    })
                    .catch(err => {
                        console.warn('Erreur permission:', err);
                        onFail('Activation impossible');
                    });
            } else if (typeof DeviceOrientationEvent !== 'undefined') {
                window.addEventListener('deviceorientation', handleOrientationEvent, true);
                window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
                setTimeout(() => {
                    if (usingSensors) onSuccess();
                    else onFail('Capteurs inactifs');
                }, 1200);
                onSuccess();
            } else {
                onFail('Capteur non supporté');
            }
        } 
        else {
            // Sur PC / Desktop :
            // Bascule en mode boussole verrouillée vers la cible
            if (enableBtn) {
                enableBtn.textContent = 'Mode Libre (Souris)';
                enableBtn.classList.add('active-mode');
            }

            // Calcule la direction cible (si GPS disponible ou défaut vers cible)
            let bearing = 0;
            if (userCoords) {
                bearing = getBearing(userCoords.lat, userCoords.lon, TARGET_COORDS.lat, TARGET_COORDS.lon);
            }
            rotateNebulaTo(bearing);
            rotateDialTo(0); // Le Nord est au sommet sur PC
        }
    }

    /**
     * Désactive le mode boussole sur PC pour revenir au mode souris libre.
     */
    function deactivateCompassOnPC() {
        isCompassActive = false;
        
        if (window.nebulaSphere && typeof window.nebulaSphere.setMode === 'function') {
            window.nebulaSphere.setMode('mouse');
        }

        if (enableBtn) {
            enableBtn.textContent = 'Activer la boussole';
            enableBtn.classList.remove('active-mode');
        }

        // Réinitialise l'orientation du cadran
        rotateDialTo(0);
    }

    /**
     * Gestion du bouton selon l'état et l'appareil.
     */
    function handleEnableButtonClick() {
        if (!isCompassActive) {
            activateCompass();
        } else if (!isMobileDevice) {
            // Sur PC, permet de re-basculer vers le mode souris libre
            deactivateCompassOnPC();
        }
    }

    // --------------------------------------------------------------------------
    // 6. GESTION DE LA SOURIS SUR PC (AVANT & APRÈS ACTIVATION)
    // --------------------------------------------------------------------------

    function setupDesktopInteraction() {
        if (isMobileDevice) return;

        window.addEventListener('mousemove', (e) => {
            // Si la boussole N'EST PAS encore activée sur PC :
            // La nébuleuse suit librement le curseur (géré par nebula.js via setMousePosition)
            if (!isCompassActive) {
                if (window.nebulaSphere && typeof window.nebulaSphere.setMousePosition === 'function') {
                    window.nebulaSphere.setMousePosition(e.clientX, e.clientY, true);
                }
            } 
            // Si la boussole EST activée sur PC :
            // On permet à l'utilisateur de simuler l'orientation de son regard autour du centre
            else {
                if (!compassContainer) return;
                const rect = compassContainer.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const dx = e.clientX - centerX;
                const dy = e.clientY - centerY;
                const cursorAngle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;

                // Fait pivoter le cadran pour simuler la rotation de l'utilisateur
                const smoothedDial = smoothAngle(currentDialAngle % 360, -cursorAngle, 0.12);
                rotateDialTo(smoothedDial);

                // La nébuleuse pointe vers la cible relative
                let targetBearing = 0;
                if (userCoords) {
                    targetBearing = getBearing(userCoords.lat, userCoords.lon, TARGET_COORDS.lat, TARGET_COORDS.lon);
                }
                const relativeAngle = normalize360(targetBearing - cursorAngle);
                const smoothedNebula = smoothAngle(currentAngle % 360, relativeAngle, 0.15);
                rotateNebulaTo(smoothedNebula);
            }
        });
    }

    // --------------------------------------------------------------------------
    // 7. GESTION DU SLIDER DE COULEUR
    // --------------------------------------------------------------------------

    function applyThemeHue(hue) {
        const h = parseInt(hue, 10) || 0;
        document.documentElement.style.setProperty('--theme-hue', h);

        if (window.nebulaSphere && typeof window.nebulaSphere.setHue === 'function') {
            window.nebulaSphere.setHue(h);
        }

        try {
            localStorage.setItem('boussole_nebula_hue', h);
        } catch (e) {}
    }

    window.applyThemeHue = applyThemeHue;

    function setupColorSlider() {
        colorSlider = document.getElementById('colorSlider');
        if (!colorSlider) return;

        let savedHue = 5;
        try {
            const val = localStorage.getItem('boussole_nebula_hue');
            if (val !== null) savedHue = parseInt(val, 10);
        } catch (e) {}

        colorSlider.value = savedHue;
        applyThemeHue(savedHue);

        colorSlider.addEventListener('input', (e) => applyThemeHue(e.target.value));
        colorSlider.addEventListener('change', (e) => applyThemeHue(e.target.value));
    }

    // --------------------------------------------------------------------------
    // 8. INITIALISATION DU MODULE
    // --------------------------------------------------------------------------

    function init() {
        compassContainer = document.getElementById('compassContainer');
        compassDial = document.getElementById('compassDial');
        distanceValEl = document.getElementById('distance-val');
        enableBtn = document.getElementById('enableCompass');
        gpsStatusEl = document.getElementById('gps-status');
        arrowEl = document.querySelector('.arrow');
        debugEl = document.getElementById('debug');

        // Initialisation de la teinte
        setupColorSlider();

        // Initialisation du mode selon l'appareil :
        // - Sur PC : démarre en mode 'mouse' (la nébuleuse suit la souris)
        // - Sur Mobile : démarre en mode 'idle' (la nébuleuse ne pointe rien)
        if (window.nebulaSphere && typeof window.nebulaSphere.setMode === 'function') {
            window.nebulaSphere.setMode(isMobileDevice ? 'idle' : 'mouse');
        }

        // Configuration du bouton d'activation
        if (enableBtn) {
            enableBtn.addEventListener('click', handleEnableButtonClick);
        }

        // Configuration de l'interaction souris sur PC
        setupDesktopInteraction();

        // ----------------------------------------------------------------------
        // Surveillance GPS en continu
        // ----------------------------------------------------------------------
        if ('geolocation' in navigator) {
            if (gpsStatusEl) gpsStatusEl.textContent = 'Recherche GPS...';

            navigator.geolocation.watchPosition(
                (position) => {
                    userCoords = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };

                    const distance = getDistance(
                        userCoords.lat, userCoords.lon,
                        TARGET_COORDS.lat, TARGET_COORDS.lon
                    );

                    updateDistanceDisplay(distance);
                    
                    if (gpsStatusEl) {
                        gpsStatusEl.textContent = 'Signal GPS verrouillé';
                        setTimeout(() => {
                            if (gpsStatusEl) gpsStatusEl.style.opacity = '0';
                        }, 3500);
                    }

                    // Si la boussole est déjà active, actualise l'orientation vers la cible
                    if (isCompassActive) {
                        const targetBearing = getBearing(userCoords.lat, userCoords.lon, TARGET_COORDS.lat, TARGET_COORDS.lon);
                        rotateNebulaTo(targetBearing);
                    }
                },
                (err) => {
                    console.warn('Erreur GPS :', err.message);
                    if (gpsStatusEl) {
                        gpsStatusEl.textContent = 'GPS inactif';
                        gpsStatusEl.style.opacity = '0.5';
                    }
                    updateDistanceDisplay(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 1000
                }
            );
        } else {
            if (gpsStatusEl) gpsStatusEl.textContent = 'GPS non supporté';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

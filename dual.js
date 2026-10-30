/**
 * ==============================================================================
 * DUAL.JS - GESTION DES MODES DESKTOP / MOBILE & CIBLE GPS
 * ==============================================================================
 * 
 * Ce script pilote les deux modes de fonctionnement demandés :
 * 
 * 1. SUR DESKTOP (Ordinateur) :
 *    - Mode 1 ('mouse')  : La nébuleuse suit directement le curseur de la souris.
 *    - Mode 2 ('target') : La nébuleuse pointe précisément vers la cible
 *                          en fonction de notre position et de la cible,
 *                          sur un cadran 100% STATIQUE (N=Haut, E=Droite, S=Bas, W=Gauche).
 *    - Le bouton bascule entre ces deux modes : "Pointer vers la cible" <-> "Suivre la souris".
 * 
 * 2. SUR MOBILE (Smartphone / Tablette) :
 *    - Mode 1 ('standby'): La nébuleuse est en veille (sphère 3D au repos qui ne pointe rien).
 *    - Mode 2 ('target') : La nébuleuse pointe vers la cible sur le cadran statique
 *                          en fonction de la position GPS et de l'orientation.
 *    - Le bouton bascule entre ces deux modes : "Activer la boussole" <-> "Mettre en veille".
 * 
 * 3. CADRAN STATIQUE :
 *    - Le cadran ne tourne pas : le Nord (N) est toujours en haut (0°), l'Est (E) à 90°,
 *      le Sud (S) à 180°, l'Ouest (W) à 270°.
 *    - La nébuleuse sert d'aiguille directionnelle vers la coordonnée cible.
 * ==============================================================================
 */

(function () {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. COORDONNÉES GÉOGRAPHIQUES (NOTRE POSITION & CIBLE)
    // --------------------------------------------------------------------------

    /**
     * Coordonnées GPS de la cible finale (Le Havre, France).
     */
    const TARGET_COORDS = {
        lat: 49.4978605, // 49°29'51.61" N
        lon: 0.1327079   // 0°07'56.78" E
    };

    /**
     * Position de départ par défaut (Paris) utilisée immédiatement
     * en attendant la confirmation du GPS réel du navigateur/téléphone.
     */
    let userCoords = {
        lat: 48.8566,
        lon: 2.3522
    };

    // Détection de l'appareil (Mobile vs Desktop)
    const isMobileDevice = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                          ('ontouchstart' in window && navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

    // Éléments du DOM
    let distanceValEl = null;
    let enableBtn = null;
    let gpsStatusEl = null;
    let colorSlider = null;
    let arrowEl = null;

    // État actif
    // Desktop : 'mouse' ou 'target'
    // Mobile  : 'standby' ou 'target'
    let currentAppMode = isMobileDevice ? 'standby' : 'mouse';

    // Variable partagée globalement pour nebula.js
    window.compassAngle = 0;

    // --------------------------------------------------------------------------
    // 2. CALCULS GÉODÉSIQUES : DISTANCE (HAVERSINE) ET CAP (AZIMUT)
    // --------------------------------------------------------------------------

    /**
     * Calcule la distance orthodromique entre deux points GPS en mètres.
     */
    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Rayon moyen de la Terre en mètres
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
     * Calcule le gisement (azimut initial / bearing) vers la cible en degrés [0, 360[.
     * 0° = Nord (Haut), 90° = Est (Droite), 180° = Sud (Bas), 270° = Ouest (Gauche).
     */
    function getBearing(lat1, lon1, lat2, lon2) {
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const y = Math.sin(deltaLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) -
                  Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return ((bearing % 360) + 360) % 360;
    }

    /**
     * Met à jour l'affichage des mètres séparant notre position de la cible.
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

    /**
     * Calcule et applique le cap et la distance vers la cible.
     */
    function applyTargetNavigation() {
        if (!userCoords) return;

        const distance = getDistance(
            userCoords.lat, userCoords.lon,
            TARGET_COORDS.lat, TARGET_COORDS.lon
        );
        const bearing = getBearing(
            userCoords.lat, userCoords.lon,
            TARGET_COORDS.lat, TARGET_COORDS.lon
        );

        // Affiche le nombre de mètres
        updateDistanceDisplay(distance);

        // Oriente la nébuleuse vers l'azimut calculé
        window.compassAngle = bearing;

        if (arrowEl) {
            arrowEl.style.transform = `translate(-50%, -50%) rotate(${bearing}deg)`;
        }
    }

    // --------------------------------------------------------------------------
    // 3. GESTION DES MODES & DU BOUTON
    // --------------------------------------------------------------------------

    /**
     * Met à jour les libellés et l'état visuel du bouton selon le mode actif.
     */
    function updateModeUI() {
        if (!enableBtn) return;

        if (isMobileDevice) {
            if (currentAppMode === 'standby') {
                enableBtn.textContent = 'Activer la boussole';
                enableBtn.classList.remove('active-mode');
                if (gpsStatusEl) gpsStatusEl.textContent = 'Mode Veille (au repos)';
            } else {
                enableBtn.textContent = 'Mettre en veille';
                enableBtn.classList.add('active-mode');
                if (gpsStatusEl) gpsStatusEl.textContent = 'Pointé vers la cible';
            }
        } else {
            if (currentAppMode === 'mouse') {
                enableBtn.textContent = 'Pointer vers la cible';
                enableBtn.classList.remove('active-mode');
                if (gpsStatusEl) gpsStatusEl.textContent = 'Mode Souris (libre)';
            } else {
                enableBtn.textContent = 'Suivre la souris';
                enableBtn.classList.add('active-mode');
                if (gpsStatusEl) gpsStatusEl.textContent = 'Pointé vers la cible (fixe)';
            }
        }
    }

    /**
     * Bascule le mode de l'application au clic sur le bouton.
     */
    function toggleMode() {
        if (isMobileDevice) {
            // Sur Mobile : bascule entre 'standby' et 'target'
            if (currentAppMode === 'standby') {
                currentAppMode = 'target';
                if (window.nebulaSphere) window.nebulaSphere.setMode('compass');
                applyTargetNavigation();
            } else {
                currentAppMode = 'standby';
                if (window.nebulaSphere) window.nebulaSphere.setMode('idle');
            }
        } else {
            // Sur Desktop : bascule entre 'mouse' et 'target'
            if (currentAppMode === 'mouse') {
                currentAppMode = 'target';
                if (window.nebulaSphere) window.nebulaSphere.setMode('compass');
                applyTargetNavigation();
            } else {
                currentAppMode = 'mouse';
                if (window.nebulaSphere) window.nebulaSphere.setMode('mouse');
            }
        }

        updateModeUI();
    }

    // --------------------------------------------------------------------------
    // 4. GESTION DU SLIDER DE COULEUR
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
    // 5. INITIALISATION DU MODULE
    // --------------------------------------------------------------------------

    function init() {
        distanceValEl = document.getElementById('distance-val');
        enableBtn = document.getElementById('enableCompass');
        gpsStatusEl = document.getElementById('gps-status');
        arrowEl = document.querySelector('.arrow');

        // Initialisation de la couleur
        setupColorSlider();

        // Calcul initial de la distance et du cap vers la cible
        applyTargetNavigation();

        // Configuration du mode initial dans la nébuleuse
        if (window.nebulaSphere) {
            if (isMobileDevice) {
                window.nebulaSphere.setMode('idle'); // Standby sur mobile
            } else {
                window.nebulaSphere.setMode('mouse'); // Suivi souris sur PC
            }
        }

        // Configuration du bouton de bascule
        if (enableBtn) {
            enableBtn.addEventListener('click', toggleMode);
        }
        updateModeUI();

        // ----------------------------------------------------------------------
        // Géolocalisation en continu (actualise notre position réelle)
        // ----------------------------------------------------------------------
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userCoords = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };

                    // Recalcule la distance et le cap avec la position réelle
                    applyTargetNavigation();
                },
                (err) => {
                    console.log('GPS passif, utilisation position par défaut:', err.message);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
            );
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

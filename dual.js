/**
 * ==============================================================================
 * DUAL.JS - LOGIQUE ÉPURÉE & ROBUSTE SANS BUGS
 * ==============================================================================
 * 
 * Fonctionnement clair et sans capteurs gyroscopiques complexes :
 * 
 * 1. CADRAN 100% STATIQUE :
 *    - Le cadran ne bouge jamais : N (0°/Haut), E (90°/Droite), S (180°/Bas), W (270°/Gauche).
 *    - La nébuleuse sert d'aiguille directionnelle.
 * 
 * 2. SUR MOBILE :
 *    - Avant activation : Mode Standby (sphère 3D au repos qui ne pointe rien).
 *    - Après activation : La nébuleuse pointe directement vers la cible en fonction
 *      de notre position et de la position cible, avec la distance en mètres.
 *    - Le bouton bascule entre ces deux modes : "Activer la boussole" <-> "Mettre en veille".
 * 
 * 3. SUR DESKTOP :
 *    - Avant activation : La nébuleuse suit librement le curseur de la souris.
 *    - Après activation : La nébuleuse pointe directement vers la cible sur le cadran fixe.
 *    - Le bouton bascule entre ces deux modes : "Pointer vers la cible" <-> "Suivre la souris".
 * ==============================================================================
 */

(function () {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. POSITION CIBLE & NOTRE POSITION
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
     * en attendant le retour éventuel du GPS du navigateur.
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
    // Mobile  : 'standby' ou 'target'
    // Desktop : 'mouse' ou 'target'
    let currentAppMode = isMobileDevice ? 'standby' : 'mouse';

    // Variable d'angle globale lue par nebula.js
    window.compassAngle = 0;

    // --------------------------------------------------------------------------
    // 2. CALCULS GÉODÉSIQUES : DISTANCE & CAP (AZIMUT)
    // --------------------------------------------------------------------------

    /**
     * Calcule la distance orthodromique entre deux points GPS en mètres (Haversine).
     */
    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Rayon moyen de la Terre
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
     * Calcule le gisement (azimut) vers la cible sur le cadran fixe [0, 360[.
     * 0° = N (Haut), 90° = E (Droite), 180° = S (Bas), 270° = W (Gauche).
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
     * Met à jour l'affichage de la distance dans le DOM.
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

        updateDistanceDisplay(distance);
        window.compassAngle = bearing;

        if (arrowEl) {
            arrowEl.style.transform = `translate(-50%, -50%) rotate(${bearing}deg)`;
        }
    }

    // --------------------------------------------------------------------------
    // 3. GESTION DES MODES & DU BOUTON
    // --------------------------------------------------------------------------

    /**
     * Met à jour le texte du bouton et le statut discret.
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
     * Bascule le mode au clic sur le bouton.
     */
    function toggleMode() {
        if (isMobileDevice) {
            // Sur Mobile : bascule Standby <-> Cible
            if (currentAppMode === 'standby') {
                currentAppMode = 'target';
                if (window.nebulaSphere) window.nebulaSphere.setMode('compass');
                applyTargetNavigation();
            } else {
                currentAppMode = 'standby';
                if (window.nebulaSphere) window.nebulaSphere.setMode('idle');
            }
        } else {
            // Sur Desktop : bascule Souris <-> Cible
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
    // 5. INITIALISATION
    // --------------------------------------------------------------------------

    function init() {
        distanceValEl = document.getElementById('distance-val');
        enableBtn = document.getElementById('enableCompass');
        gpsStatusEl = document.getElementById('gps-status');
        arrowEl = document.querySelector('.arrow');

        // Initialisation de la teinte
        setupColorSlider();

        // Calcul initial de la distance et du cap
        applyTargetNavigation();

        // Configuration du mode initial de la nébuleuse
        if (window.nebulaSphere) {
            if (isMobileDevice) {
                window.nebulaSphere.setMode('idle'); // Standby au repos sur mobile
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
        // Géolocalisation GPS en direct (si accordée)
        // ----------------------------------------------------------------------
        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userCoords = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };

                    // Si le mode cible est actif, met à jour la navigation en direct
                    if (currentAppMode === 'target') {
                        applyTargetNavigation();
                    }
                },
                (err) => {
                    // Repli silencieux sur la position par défaut
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

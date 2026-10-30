/**
 * ==============================================================================
 * NEBULA.JS - MOTEUR DE PARTICULES 3D DE LA NÉBULEUSE EN FORME DE BOUSSOLE
 * ==============================================================================
 * Ce script gère une sphère de particules 3D animée dans un Canvas 2D.
 * 
 * La nébuleuse joue le rôle de l'AIGUILLE VIVANTE de la boussole :
 * - Le cadran extérieur (N, E, S, W) est STATIQUE :
 *     * N (Nord)  = 0°   (Haut)
 *     * E (Est)   = 90°  (Droite)
 *     * S (Sud)   = 180° (Bas)
 *     * W (Ouest) = 270° (Gauche)
 * - La pointe de la nébuleuse est attirée vers l'angle exact de la cible
 *   (window.compassAngle), sculptant la forme de goutte vers cette direction.
 * 
 * Modes :
 * 1. 'compass' : La nébuleuse pointe précisément vers la cible sur le cadran statique.
 * 2. 'mouse'   : La nébuleuse suit directement le curseur de la souris (mode libre).
 * 3. 'idle'    : Sphère 3D harmonieuse au repos (sans déformation).
 * ==============================================================================
 */

(function () {
    'use strict';

    /**
     * Convertit une couleur HSL (Teinte, Saturation, Luminosité) en composantes RGB.
     * @param {number} h - Teinte en degrés [0, 360]
     * @param {number} s - Saturation en pourcentage [0, 100]
     * @param {number} l - Luminosité en pourcentage [0, 100]
     * @returns {[number, number, number]} Tableau [r, g, b] avec des valeurs entières [0, 255]
     */
    function hslToRgb(h, s, l) {
        s /= 100;
        l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [
            Math.round(f(0) * 255),
            Math.round(f(8) * 255),
            Math.round(f(4) * 255)
        ];
    }

    class NebulaSphere {
        /**
         * Initialise la sphère nébuleuse.
         * @param {string} canvasId - L'ID de l'élément canvas
         * @param {Object} options - Paramètres de configuration
         */
        constructor(canvasId, options = {}) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) {
                console.error('Canvas introuvable:', canvasId);
                return;
            }

            // Contexte 2D optimisé
            this.ctx = this.canvas.getContext('2d', { alpha: true });

            // Lecture de la teinte initiale depuis les variables CSS ou localStorage
            let initialHue = 5;
            try {
                const cssHue = getComputedStyle(document.documentElement).getPropertyValue('--theme-hue');
                if (cssHue && !isNaN(parseInt(cssHue.trim(), 10))) {
                    initialHue = parseInt(cssHue.trim(), 10);
                }
            } catch (e) {}

            // Configuration générale
            this.config = {
                particleCount: 4200,      // Nombre de particules de poussière stellaire
                baseRadius: 280,          // Rayon de la sphère de base au repos
                interactionRadius: 1600,  // Rayon d'influence de l'attraction
                warpStrength: 5.8,        // Force maximale de déformation
                rotationSpeed: 0.12,      // Vitesse de rotation lente sur elle-même
                needleOutset: 280,        // Décalage de la pointe pour la forme boussole
                hue: initialHue,          // Teinte HSL (synchronisée avec le thème)
                mode: 'compass',          // 'compass' par défaut pour pointer immédiatement
                ...options
            };

            // Mode actif
            this.mode = this.config.mode;

            // Constantes de physique
            this.SPRING = 0.055;          // Force de rappel élastique vers la forme de base
            this.FRICTION = 0.89;         // Amortissement de la vélocité
            this.Z_PERSPECTIVE = 820;     // Distance focale de la caméra virtuelle

            // Tableau contenant toutes les particules
            this.particles = [];

            // État de la position du curseur souris (en coordonnées canvas brutes)
            this.mousePos = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
                isActive: false
            };

            // Point d'attraction cible interpolé
            this.targetPoint = { x: 0, y: 0, currentWarp: 0 };

            // Cache géométrique pour éviter les reflows DOM
            this.bounds = {
                width: 0,
                height: 0,
                dpr: 1,
                centerX: 0,
                centerY: 0,
                compassRadius: 170
            };

            // Canvas hors-écran (sprite) pour le rendu ultra-rapide des particules avec halo
            this.particleSprite = document.createElement('canvas');
            this.spriteCtx = this.particleSprite.getContext('2d');
            this.spriteSize = 32;
            this.particleSprite.width = this.spriteSize;
            this.particleSprite.height = this.spriteSize;

            // Couleur RGB active
            this.rgb = hslToRgb(this.config.hue, 100, 55);

            // Initialisations
            this.updateSpriteTexture();
            this.initParticles();
            this.bindEvents();
            this.resize();

            // Boucle d'animation
            this.animate = this.animate.bind(this);
            this.animationId = requestAnimationFrame(this.animate);
        }

        /**
         * Change le mode de fonctionnement de la nébuleuse.
         * @param {'idle' | 'mouse' | 'compass'} newMode - Nouveau mode
         */
        setMode(newMode) {
            this.mode = newMode;
        }

        /**
         * Met à jour la position de la souris (pour le mode 'mouse' sur PC).
         * @param {number} clientX - Coordonnée X de la souris
         * @param {number} clientY - Coordonnée Y de la souris
         * @param {boolean} isActive - Si la souris est active sur la fenêtre
         */
        setMousePosition(clientX, clientY, isActive = true) {
            const dpr = this.bounds.dpr;
            this.mousePos.x = clientX * dpr;
            this.mousePos.y = clientY * dpr;
            this.mousePos.isActive = isActive;
        }

        /**
         * Génère ou rafraîchit la texture du sprite de particule dans le canvas hors-écran.
         */
        updateSpriteTexture() {
            const [r, g, b] = this.rgb;
            const ctx = this.spriteCtx;
            const size = this.spriteSize;
            const half = size / 2;

            ctx.clearRect(0, 0, size, size);

            const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
            gradient.addColorStop(0.0, `rgba(255, 255, 255, 1.0)`);
            gradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, 0.95)`);
            gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.35)`);
            gradient.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(half, half, half, 0, Math.PI * 2);
            ctx.fill();
        }

        /**
         * Modifie la teinte HSL de la nébuleuse en temps réel (appelé par le slider).
         * @param {number} hue - Teinte en degrés (0 à 360)
         */
        setHue(hue) {
            this.config.hue = hue;
            this.rgb = hslToRgb(hue, 100, 55);
            this.updateSpriteTexture();
        }

        /**
         * Distribue les particules uniformément sur une sphère 3D (spirale de Fibonacci).
         */
        initParticles() {
            this.particles = [];
            const count = this.config.particleCount;
            const radius = this.config.baseRadius;

            for (let i = 0; i < count; i++) {
                const phi = Math.acos(1 - 2 * (i + 0.5) / count);
                const theta = Math.PI * (1 + Math.sqrt(5)) * i;

                const x = radius * Math.sin(phi) * Math.cos(theta);
                const y = radius * Math.sin(phi) * Math.sin(theta);
                const z = radius * Math.cos(phi);

                this.particles.push({
                    baseX: x,
                    baseY: y,
                    baseZ: z,
                    x: x,
                    y: y,
                    z: z,
                    vx: 0,
                    vy: 0,
                    vz: 0,
                    size: Math.random() * 2.8 + 1.2,
                    alpha: Math.random() * 0.5 + 0.5
                });
            }
        }

        /**
         * Recalcule la taille du canvas et met en cache les géométries centrales.
         */
        resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = window.innerWidth;
            const h = window.innerHeight;

            this.canvas.width = Math.floor(w * dpr);
            this.canvas.height = Math.floor(h * dpr);
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';

            this.bounds.width = this.canvas.width;
            this.bounds.height = this.canvas.height;
            this.bounds.dpr = dpr;
            this.bounds.centerX = this.bounds.width / 2;
            this.bounds.centerY = this.bounds.height / 2;

            const compassEl = document.getElementById('compassContainer');
            if (compassEl) {
                const rect = compassEl.getBoundingClientRect();
                this.bounds.compassRadius = (Math.min(rect.width, rect.height) / 2) * dpr;
            } else {
                this.bounds.compassRadius = Math.min(w, h) * 0.22 * dpr;
            }
        }

        /**
         * Écoute les événements globaux de redimensionnement et de mouvement souris.
         */
        bindEvents() {
            window.addEventListener('resize', () => this.resize(), { passive: true });
            window.addEventListener('orientationchange', () => {
                setTimeout(() => this.resize(), 150);
            }, { passive: true });

            // Écoute de la souris pour le mode libre sur desktop
            window.addEventListener('mousemove', (e) => {
                if (this.mode === 'mouse') {
                    this.setMousePosition(e.clientX, e.clientY, true);
                }
            }, { passive: true });

            window.addEventListener('mouseleave', () => {
                if (this.mode === 'mouse') {
                    this.mousePos.isActive = false;
                }
            }, { passive: true });
        }

        /**
         * Boucle d'animation principale à chaque trame.
         */
        animate() {
            const ctx = this.ctx;
            const { width, height, centerX, centerY, dpr } = this.bounds;

            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';

            // Temps évolutif pour la rotation sur soi-même
            const time = Date.now() * 0.001 * this.config.rotationSpeed;

            // ------------------------------------------------------------------
            // Détermination du point d'attraction et de la force selon le mode
            // ------------------------------------------------------------------
            let targetX = centerX;
            let targetY = centerY;
            let targetWarp = 0; // Par défaut en mode 'idle' : 0 (aucune pointe, sphère parfaite)

            if (this.mode === 'compass') {
                // Mode Boussole active : la nébuleuse pointe dans la direction de la boussole
                // TRIGONOMÉTRIE DIRECTE SUR CADRAN FIXE :
                // 0°   = NORD  (Haut)   -> sin(0) = 0   , -cos(0) = -1  (Y < centerY)
                // 90°  = EST   (Droite) -> sin(90) = 1  , -cos(90) = 0  (X > centerX)
                // 180° = SUD   (Bas)    -> sin(180) = 0 , -cos(180) = +1 (Y > centerY)
                // 270° = OUEST (Gauche) -> sin(270) = -1, -cos(270) = 0 (X < centerX)
                const angleDeg = (typeof window.compassAngle === 'number') ? window.compassAngle : 0;
                const rotRad = angleDeg * Math.PI / 180;
                const tipRadius = this.bounds.compassRadius + (this.config.needleOutset * (dpr * 0.7));

                targetX = centerX + Math.sin(rotRad) * tipRadius;
                targetY = centerY - Math.cos(rotRad) * tipRadius;
                targetWarp = this.config.warpStrength;
            } 
            else if (this.mode === 'mouse') {
                // Mode Souris sur PC : la nébuleuse suit la souris
                if (this.mousePos.isActive) {
                    targetX = this.mousePos.x;
                    targetY = this.mousePos.y;
                    targetWarp = this.config.warpStrength;
                } else {
                    targetX = centerX;
                    targetY = centerY;
                    targetWarp = 0;
                }
            } 
            else {
                // Mode 'idle' : sphère stellaire parfaite au repos
                targetX = centerX;
                targetY = centerY;
                targetWarp = 0;
            }

            // Lissage progressif de la force de déformation pour une transition fluide entre modes
            this.targetPoint.currentWarp += (targetWarp - this.targetPoint.currentWarp) * 0.08;
            const effectiveWarp = this.targetPoint.currentWarp;

            // Calcul de l'inclinaison 3D globale de la sphère
            const relX = targetX - centerX;
            const relY = targetY - centerY;
            const rotX = (effectiveWarp > 0.1) ? -relY * 0.0001 : 0;
            const rotY = (effectiveWarp > 0.1) ? -relX * 0.0001 : 0;

            const cosRotY = Math.cos(rotY), sinRotY = Math.sin(rotY);
            const cosRotX = Math.cos(rotX), sinRotX = Math.sin(rotX);
            const cosTime = Math.cos(time), sinTime = Math.sin(time);

            const interactRad = this.config.interactionRadius * dpr;
            const sprite = this.particleSprite;

            // ------------------------------------------------------------------
            // Simulation et rendu des particules
            // ------------------------------------------------------------------
            const len = this.particles.length;
            for (let i = 0; i < len; i++) {
                const p = this.particles[i];

                // 1. Rotation 3D de base autour de l'axe Y
                let tx = p.baseX * cosTime - p.baseZ * sinTime;
                let tz = p.baseX * sinTime + p.baseZ * cosTime;
                let ty = p.baseY;

                // 2. Inclinaison vers la direction active (si déformation présente)
                if (effectiveWarp > 0.1) {
                    let mx = tx * cosRotY - tz * sinRotY;
                    let mz = tx * sinRotY + tz * cosRotY;
                    tx = mx; tz = mz;

                    let my = ty * cosRotX - tz * sinRotX;
                    mz = ty * sinRotX + tz * cosRotX;
                    ty = my; tz = mz;
                }

                // 3. Physique d'élasticité (ressort vers position de base)
                p.vx += (tx - p.x) * this.SPRING;
                p.vy += (ty - p.y) * this.SPRING;
                p.vz += (tz - p.z) * this.SPRING;

                // 4. Déformation attractive vers targetX / targetY
                if (effectiveWarp > 0.05) {
                    const scale = this.Z_PERSPECTIVE / (this.Z_PERSPECTIVE + p.z);
                    const sx = centerX + p.x * scale * dpr;
                    const sy = centerY + p.y * scale * dpr;

                    const dx = sx - targetX;
                    const dy = sy - targetY;
                    const dist = Math.hypot(dx, dy);

                    if (dist < interactRad) {
                        const force = (interactRad - dist) / interactRad;
                        const angle = Math.atan2(dy, dx);

                        p.vx += -Math.cos(angle) * force * effectiveWarp;
                        p.vy += -Math.sin(angle) * force * effectiveWarp;
                        p.vz += force * effectiveWarp * 0.4;
                    }
                }

                // 5. Intégration de la vélocité et frottements
                p.x += p.vx;
                p.y += p.vy;
                p.z += p.vz;
                p.vx *= this.FRICTION;
                p.vy *= this.FRICTION;
                p.vz *= this.FRICTION;

                // 6. Rendu par projection perspective
                const finalScale = this.Z_PERSPECTIVE / (this.Z_PERSPECTIVE + p.z);
                if (p.z > -this.Z_PERSPECTIVE + 20 && finalScale > 0) {
                    const renderSize = p.size * finalScale * dpr * 2.2;
                    const alpha = Math.min(1, Math.max(0.12, (finalScale * p.alpha) - (p.z / 1200)));

                    ctx.globalAlpha = alpha;
                    ctx.drawImage(
                        sprite,
                        (centerX + p.x * finalScale * dpr) - renderSize / 2,
                        (centerY + p.y * finalScale * dpr) - renderSize / 2,
                        renderSize,
                        renderSize
                    );
                }
            }

            ctx.globalAlpha = 1.0;
            this.animationId = requestAnimationFrame(this.animate);
        }
    }

    // Expose l'instance globalement pour que dual.js puisse contrôler le mode et la teinte
    window.nebulaSphere = new NebulaSphere('nebula-canvas');

})();

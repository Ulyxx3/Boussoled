(function() {
  class NebulaSphere {
    constructor(canvasId, options = {}) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) { console.error('Canvas not found:', canvasId); return; }
      this.config = { ...{"particleCount":5000,"baseRadius":300,"interactionRadius":1800,"warpStrength":6,"rotationSpeed":0.15,"colorTheme":"fire","hoverType":"attract","needleOutset":300}, ...options };
      this.ctx = this.canvas.getContext('2d');
      this.particles = [];
      this.mouse = { x: 0, y: 0, isActive: false };
      this.SPRING = 0.05; this.FRICTION = 0.90; this.Z_PERSPECTIVE = 800;
      // detect compass needle tip as interaction source if present
      this.needleElem = document.querySelector('.arrow');
      this.useNeedleTip = !!this.needleElem;
      this.init(); this.bindEvents(); this.animate();
    }
    init() {
      this.resize(); this.particles = [];
      const { particleCount, baseRadius } = this.config;
      for (let i = 0; i < particleCount; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / particleCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const x = baseRadius * Math.sin(phi) * Math.cos(theta);
        const y = baseRadius * Math.sin(phi) * Math.sin(theta);
        const z = baseRadius * Math.cos(phi);
        this.particles.push({ baseX: x, baseY: y, baseZ: z, x: x, y: y, z: z, vx: 0, vy: 0, vz: 0, size: Math.random() * 1.5 + 0.5, alpha: Math.random() * 0.5 + 0.5 });
      }
    }
    resize() {
      const dpr = window.devicePixelRatio || 1; const width = window.innerWidth; const height = window.innerHeight;
      this.canvas.width = width * dpr; this.canvas.height = height * dpr; this.canvas.style.width = width + 'px'; this.canvas.style.height = height + 'px';
    }
    bindEvents() {
      window.addEventListener('resize', () => this.resize());
      const onMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        this.mouse.x = clientX - rect.left; this.mouse.y = clientY - rect.top; this.mouse.isActive = true;
      };
      const onLeave = () => { this.mouse.isActive = false; };
      this.canvas.addEventListener('mousemove', onMove);
      this.canvas.addEventListener('touchmove', onMove, { passive: false });
      this.canvas.addEventListener('mouseleave', onLeave);
      this.canvas.addEventListener('touchend', onLeave);
    }
    animate() {
      const width = this.canvas.width; const height = this.canvas.height; const cx = width / 2; const cy = height / 2;
      this.ctx.clearRect(0, 0, width, height); this.ctx.globalCompositeOperation = 'lighter';
      let r=180, g=200, b=255; if (this.config.colorTheme === 'purple') { r=200; g=100; b=255; } else if (this.config.colorTheme === 'fire') { r=255; g=60; b=50; } else if (this.config.colorTheme === 'white') { r=220; g=220; b=220; }
      const time = Date.now() * 0.001 * this.config.rotationSpeed;
      // If using needle tip as source, update mouse coords from needle
      if (this.useNeedleTip && this.needleElem) {
        // Use angle from dual.js which is the source of truth
        const angleFromDual = (typeof window.compassAngle === 'number') ? window.compassAngle : 0;
        const rot = angleFromDual * Math.PI / 180; // convert to radians
        
        const compassEl = this.needleElem.closest('.compass');
        const compRect = compassEl ? compassEl.getBoundingClientRect() : null;
        const canvasRect = this.canvas.getBoundingClientRect();

        if (compRect) {
          // compass center
          const centerX = compRect.left + compRect.width/2;
          const centerY = compRect.top + compRect.height/2;
          // put the interaction on the outer edge (slightly inset)
          const outset = (this.config && typeof this.config.needleOutset === 'number') ? this.config.needleOutset : 0;
          const radius = Math.min(compRect.width, compRect.height)/2 - 6 + outset;

          // arrow graphic points down at rotation=0 (CSS coordinate system)
          // Invert X axis to fix direction
          const tipX = centerX - Math.sin(rot) * radius;
          const tipY = centerY - Math.cos(rot) * radius; // ← MOINS ici !

          // convert to canvas-local coords
          this.mouse.x = tipX - canvasRect.left;
          this.mouse.y = tipY - canvasRect.top;
          this.mouse.isActive = true;
        } else {
          // fallback if compass not found
          const nr = this.needleElem.getBoundingClientRect();
          const tipX = nr.left + nr.width/2;
          const tipY = nr.top;
          this.mouse.x = tipX - canvasRect.left;
          this.mouse.y = tipY - canvasRect.top;
          this.mouse.isActive = true;
        }
      }
      const mouseRelX = (this.mouse.x * (width / this.canvas.offsetWidth)) - cx;
      const mouseRelY = (this.mouse.y * (height / this.canvas.offsetHeight)) - cy;
      // Invert rotation direction so sphere follows needle instead of opposite
      const rotX = this.mouse.isActive ? -mouseRelY * 0.0001 : 0; const rotY = this.mouse.isActive ? -mouseRelX * 0.0001 : 0;
      this.particles.forEach(p => {
        let tx = p.baseX * Math.cos(time) - p.baseZ * Math.sin(time);
        let tz = p.baseX * Math.sin(time) + p.baseZ * Math.cos(time);
        let ty = p.baseY;
        if (this.mouse.isActive) {
          let mx = tx * Math.cos(rotY) - tz * Math.sin(rotY);
          let mz = tx * Math.sin(rotY) + tz * Math.cos(rotY);
          tx = mx; tz = mz;
          let my = ty * Math.cos(rotX) - tz * Math.sin(rotX);
          mz = ty * Math.sin(rotX) + tz * Math.cos(rotX);
          ty = my; tz = mz;
        }
        p.vx += (tx - p.x) * this.SPRING; p.vy += (ty - p.y) * this.SPRING; p.vz += (tz - p.z) * this.SPRING;
        const scale = this.Z_PERSPECTIVE / (this.Z_PERSPECTIVE + p.z);
        const sx = cx + p.x * scale; const sy = cy + p.y * scale;
        if (this.mouse.isActive) {
          const dx = sx - (this.mouse.x * (width/this.canvas.offsetWidth)); const dy = sy - (this.mouse.y * (height/this.canvas.offsetHeight));
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < this.config.interactionRadius) {
            const force = (this.config.interactionRadius - dist) / this.config.interactionRadius;
            const angle = Math.atan2(dy, dx);
            let fx=0, fy=0, fz=0; const str = this.config.warpStrength;
            if (this.config.hoverType === 'attract') { fx = -Math.cos(angle) * force * str; fy = -Math.sin(angle) * force * str; fz = force * str * 0.5; }
            else if (this.config.hoverType === 'swirl') { fx = -Math.sin(angle) * force * str; fy = Math.cos(angle) * force * str; }
            else { fx = Math.cos(angle) * force * str; fy = Math.sin(angle) * force * str; fz = -force * str * 0.5; }
            p.vx += fx; p.vy += fy; p.vz += fz;
          }
        }
        p.x += p.vx; p.y += p.vy; p.z += p.vz; p.vx *= this.FRICTION; p.vy *= this.FRICTION; p.vz *= this.FRICTION;
        const finalScale = this.Z_PERSPECTIVE / (this.Z_PERSPECTIVE + p.z);
        if (p.z > -this.Z_PERSPECTIVE + 10 && finalScale > 0) {
          const alpha = Math.min(1, Math.max(0.1, (finalScale * p.alpha) - (p.z/1000)));
          this.ctx.beginPath(); this.ctx.arc(cx + p.x * finalScale, cy + p.y * finalScale, p.size * finalScale, 0, Math.PI * 2);
          this.ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`; this.ctx.fill();
        }
      });
      this.animationId = requestAnimationFrame(() => this.animate());
    }
  }
  new NebulaSphere('nebula-canvas');
})();

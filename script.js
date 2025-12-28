const arrow = document.querySelector('.arrow');
const compass = document.querySelector('.compass');
const distanceEl = document.getElementById('distance');

let currentAngle = 0;

document.addEventListener('mousemove', (e) => {
    const compassRect = compass.getBoundingClientRect();
    const compassX = compassRect.left + compassRect.width / 2;
    const compassY = compassRect.top + compassRect.height / 2;
    
    const angleRad = Math.atan2(e.clientY - compassY, e.clientX - compassX);
    const targetAngle = angleRad * (180 / Math.PI) + 90;

    // Calcule la différence d'angle la plus courte pour éviter le "saut"
    let angleDiff = targetAngle - (currentAngle % 360);
    if (angleDiff > 180) {
        angleDiff -= 360;
    } else if (angleDiff < -180) {
        angleDiff += 360;
    }
    
    currentAngle += angleDiff;
    
    arrow.style.transform = `translateX(-50%) rotate(${currentAngle}deg)`;

    const deltaX = e.clientX - compassX;
    const deltaY = e.clientY - compassY;
    const distance = Math.round(Math.sqrt(deltaX * deltaX + deltaY * deltaY));

    distanceEl.textContent = `${distance}px`;
});

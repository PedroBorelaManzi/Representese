const fs = require('fs');

const pitchPath = 'src/pages/LandingPitch.tsx';
let pitch = fs.readFileSync(pitchPath, 'utf8');
pitch = pitch.replace(/\/assets\/(setor_[a-z_]+)\.png/g, '/assets/$1.webp');
pitch = pitch.replace(/\/assets\/dashboard_mockup\.png/g, '/assets/dashboard_mockup.webp');
fs.writeFileSync(pitchPath, pitch, 'utf8');

const logoPath = 'src/components/Logo.tsx';
let logo = fs.readFileSync(logoPath, 'utf8');
logo = logo.replace(/logo\.png/g, 'logo.webp');
fs.writeFileSync(logoPath, logo, 'utf8');

console.log('Updated components');

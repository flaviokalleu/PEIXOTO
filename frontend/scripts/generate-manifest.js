const fs = require('fs');
const path = require('path');
require('dotenv').config();

const templatePath = path.join(__dirname, '../public/manifest.template.json');
const outputPath = path.join(__dirname, '../public/manifest.json');

try {
    let manifestTemplate = fs.readFileSync(templatePath, 'utf8');
    
    // Replace placeholders with environment variables
    const manifest = manifestTemplate.replace(/%APP_NAME%/g, process.env.REACT_APP_NAME || 'MetaBot');
    
    fs.writeFileSync(outputPath, manifest);
    console.log('✅ manifest.json generated successfully');
} catch (error) {
    console.error('Error generating manifest.json:', error);
    process.exit(1);
}
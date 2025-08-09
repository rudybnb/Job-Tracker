// Clear localStorage cache for CSV and job data
console.log('Clearing all cached CSV and job data...');

localStorage.removeItem('processedCSVs');
localStorage.removeItem('uploadedJobs');
localStorage.removeItem('csvUploads');

console.log('✓ Cache cleared. Please refresh the page and upload your CSV again.');
console.log('This will ensure only authentic CSV data from your "Build Phase" column is used.');
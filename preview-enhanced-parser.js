// Preview of Enhanced CSV Parser for New Format
// This shows what the new format would extract without affecting existing jobs

const fs = require('fs');

function parseEnhancedCSV(csvContent) {
  const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
  
  // Extract job details (first 4 lines)
  let jobName = "Data Missing from CSV";
  let jobAddress = "Data Missing from CSV";
  let jobPostcode = "Data Missing from CSV";
  let jobType = "Data Missing from CSV";
  
  // Parse header information
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    if (line.startsWith('Name') && line.includes(',')) {
      jobName = line.split(',')[1]?.trim() || "Data Missing from CSV";
    } else if (line.startsWith('Address') && line.includes(',')) {
      jobAddress = line.split(',')[1]?.trim() || "Data Missing from CSV";
    } else if (line.startsWith('Post Code') && line.includes(',')) {
      jobPostcode = line.split(',')[1]?.trim().toUpperCase() || "Data Missing from CSV";
    } else if (line.startsWith('Project Type') && line.includes(',')) {
      jobType = line.split(',')[1]?.trim() || "Data Missing from CSV";
    }
  }
  
  // Find data section (Order Date, Date Required, Build Phase...)
  const dataHeaderIndex = lines.findIndex(line => 
    line.includes('Order Date') && line.includes('Build Phase') && line.includes('Resource Description')
  );
  
  if (dataHeaderIndex === -1) {
    return { jobName, jobAddress, jobPostcode, jobType, resources: [], summary: {} };
  }
  
  const resources = [];
  const summary = {
    totalLabour: 0,
    totalMaterial: 0,
    phases: new Set(),
    suppliers: new Set(),
    weeklyBreakdown: {}
  };
  
  // Parse resource lines
  for (let i = dataHeaderIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 8) continue;
    
    const resource = {
      orderDate: parts[0] || '',
      requiredDate: parts[1] || '',
      buildPhase: parts[2] || '',
      resourceType: parts[3] || '', // Labour or Material
      supplier: parts[4] || '',
      description: parts[5] || '',
      quantity: parseInt(parts[7]) || 0
    };
    
    // Extract price using regex
    const priceMatch = resource.description.match(/£(\d+\.?\d*)/);
    const unitMatch = resource.description.match(/£\d+\.?\d*\/(\w+)/);
    
    if (priceMatch) {
      resource.unitPrice = parseFloat(priceMatch[1]);
      resource.unit = unitMatch ? unitMatch[1] : 'Each';
      resource.totalCost = resource.unitPrice * resource.quantity;
      
      // Add to summary
      if (resource.resourceType.toLowerCase() === 'labour') {
        summary.totalLabour += resource.totalCost;
      } else if (resource.resourceType.toLowerCase() === 'material') {
        summary.totalMaterial += resource.totalCost;
      }
      
      // Track phases and suppliers
      if (resource.buildPhase) summary.phases.add(resource.buildPhase);
      if (resource.supplier) summary.suppliers.add(resource.supplier);
      
      // Weekly breakdown
      if (resource.orderDate) {
        if (!summary.weeklyBreakdown[resource.orderDate]) {
          summary.weeklyBreakdown[resource.orderDate] = { labour: 0, material: 0, total: 0 };
        }
        summary.weeklyBreakdown[resource.orderDate][resource.resourceType.toLowerCase()] += resource.totalCost;
        summary.weeklyBreakdown[resource.orderDate].total += resource.totalCost;
      }
    }
    
    resources.push(resource);
  }
  
  // Convert sets to arrays
  summary.phases = Array.from(summary.phases);
  summary.suppliers = Array.from(summary.suppliers);
  summary.grandTotal = summary.totalLabour + summary.totalMaterial;
  
  return {
    jobName,
    jobAddress,
    jobPostcode,
    jobType,
    resources,
    summary
  };
}

// Test with the new format
const csvContent = `Name ,Queens way,,,,,,
Address,Stevenge,,,,,,
Post Code ,SG1 1EH,,,,,,
Project Type,Flats FitOut,,,,,,
,,,,,,,
,,,,,,,
Order Date, Date Required, Build Phase,Type of Resource, Supplier, Resource Description,, Order Quantity
01/09/2025,01/09/2025,Internal Decoration,Labour,Wickes,Decorator £29.00/Hours,,72
15/09/2025,15/09/2025,,Material,selco,Contract Emulsion Magnolia 5 Litre £37.00/Each,,19
15/09/2025,15/09/2025,,Material,selco,Gloss Brilliant White 5 Litre £40.50/Each,,0
15/09/2025,15/09/2025,,Material,selco,Undercoat White 5 Litre £38.00/Each,,1
01/09/2025,01/09/2025,Joinery 1st Fix,Labour,selco,Joiner's Mate £22.00/Hours,,0
01/09/2025,01/09/2025,,Labour,selco,Partition Installer £24.00/Hours,,45
15/09/2025,15/09/2025,,Material,MGN,Metal C Stud 2400mm £2.50/Each,,201
15/09/2025,15/09/2025,,Material,MGN,Screws and fixings allowance £1.00/Each,,553
01/09/2025,01/09/2025,Plastering,Labour,Trade Piont,2 Plasterers & Mate £83.00/Hours,,105`;

const result = parseEnhancedCSV(csvContent);

console.log('\n🏗️  ENHANCED CSV PARSING PREVIEW');
console.log('=====================================');
console.log(`📝 Job: ${result.jobName}`);
console.log(`📍 Location: ${result.jobAddress}, ${result.jobPostcode}`);
console.log(`🏢 Type: ${result.jobType}`);
console.log(`\n💰 FINANCIAL SUMMARY:`);
console.log(`   Labour Costs: £${result.summary.totalLabour.toFixed(2)}`);
console.log(`   Material Costs: £${result.summary.totalMaterial.toFixed(2)}`);
console.log(`   Grand Total: £${result.summary.grandTotal.toFixed(2)}`);

console.log(`\n🏗️  BUILD PHASES (${result.summary.phases.length}):`);
result.summary.phases.forEach(phase => console.log(`   • ${phase}`));

console.log(`\n🏪 SUPPLIERS (${result.summary.suppliers.length}):`);
result.summary.suppliers.forEach(supplier => console.log(`   • ${supplier}`));

console.log(`\n📅 WEEKLY CASH FLOW:`);
Object.entries(result.summary.weeklyBreakdown).forEach(([date, costs]) => {
  console.log(`   Week ${date}:`);
  console.log(`     Labour: £${costs.labour.toFixed(2)}`);
  console.log(`     Material: £${costs.material.toFixed(2)}`);
  console.log(`     Total: £${costs.total.toFixed(2)}`);
});

console.log(`\n📋 DETAILED RESOURCES (${result.resources.length} items):`);
result.resources.slice(0, 5).forEach(resource => {
  if (resource.unitPrice) {
    console.log(`   ${resource.buildPhase || 'General'} | ${resource.resourceType}`);
    console.log(`     ${resource.description}`);
    console.log(`     ${resource.quantity} × £${resource.unitPrice} = £${resource.totalCost.toFixed(2)}`);
    console.log(`     Supplier: ${resource.supplier} | Order: ${resource.orderDate}`);
  }
});

if (result.resources.length > 5) {
  console.log(`   ... and ${result.resources.length - 5} more items`);
}
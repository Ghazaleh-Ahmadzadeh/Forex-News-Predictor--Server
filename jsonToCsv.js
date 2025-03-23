const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv'); 

const inputFile = path.join(__dirname, 'historical.json');
const outputFile = path.join(__dirname, 'historical.csv');

fs.readFile(inputFile, 'utf8', (err, data) => {
  if (err) {
    console.error("Error reading JSON file:", err);
    process.exit(1);
  }
  
  let jsonData;
  try {
    jsonData = JSON.parse(data);
  } catch (parseErr) {
    console.error("Error parsing JSON:", parseErr);
    process.exit(1);
  }
  
  
  // Map each record to an object with only date and rate (from close)
  const records = jsonData.map(record => ({
    date: record.date, 
    rate: record.close
  }));
  
  const fields = ['date', 'rate'];
  try {
    const csv = parse(records, { fields });
    fs.writeFile(outputFile, csv, err => {
      if (err) {
        console.error("Error writing CSV file:", err);
      } else {
        console.log("CSV file successfully saved to", outputFile);
      }
    });
  } catch (err) {
    console.error("Error converting JSON to CSV:", err);
  }
});

/************************************************************
 * Global Variables
 ************************************************************/
let parsedData = [];         // All parsed data points
let filteredData = [];       // Filtered data (by RID)
let selectedDataPoints = []; // Currently selected points (by station index)
let customGroups = [];       // User-defined data point groups
let removedPoints = [];      // Points removed from chart
let currentRID = null;       // Currently selected Route ID
let isRemoveMode = false;    // Whether remove mode is active (for clicking points)
let mapInstance = null;      // Leaflet map instance
let mapMarkers = [];         // Array of Leaflet markers
let selectedGroups = [];     // Array of group IDs that are selected for percentage change calculation
let originalColumns = [];    // Original column order from Excel file
let colorPalette = [
  '#FF6384', // Bright pink
  '#FF9F40', // Orange
  '#4BC0C0', // Teal
  '#9966FF', // Purple
  '#C9CB3A', // Lime
  '#EA5545', // Coral
  '#87BC45', // Green
  '#D85040', // Rust
  '#B33DC6', // Magenta
  '#46A2D5', // Light blue
  '#E27A3F', // Burnt orange
  '#75DDDD'  // Aqua
];
let viewedRIDs = new Set();  // Track RIDs that user has already viewed

// Map variables
let mapInitialized = false;  // Track if map was successfully initialized

/************************************************************
 * DOMContentLoaded Listener
 ************************************************************/
document.addEventListener('DOMContentLoaded', () => {
  // Initialize drag-and-drop events for upload area
  const uploadArea = document.getElementById('upload-area');
  uploadArea.addEventListener('dragover', handleDragOver);
  uploadArea.addEventListener('drop', handleDrop);
  
  // Add click event listener to the upload button
  const uploadBtn = document.getElementById('trigger-upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation(); // Prevent event from bubbling up to upload area
      const fileInput = document.getElementById('file-input');
      if (fileInput) {
        fileInput.click();
      }
    });
  }
  
  // Also directly add an event listener to the file input element
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      console.log("File input change event triggered");
      handleFileSelection(this.files);
    });
  }

  // Check for required libraries and set up initialization
  initializeApp();
});

/************************************************************
 * App Initialization
 ************************************************************/
function initializeApp() {
  // Track initialization status
  let initialized = false;
  let checkCount = 0;
  const maxChecks = 20;
  const checkInterval = 250; // ms
  
  // Function to check if required libraries are loaded
  function checkLibraries() {
    checkCount++;
    
    // Check if all required libraries are available
    const plotlyReady = typeof Plotly !== 'undefined';
    const xlsxReady = typeof XLSX !== 'undefined';
    const leafletReady = typeof L !== 'undefined';
    
    console.log(`Library check #${checkCount}: Plotly: ${plotlyReady}, XLSX: ${xlsxReady}, Leaflet: ${leafletReady}`);
    
    // If we have librariesLoaded tracking object from the HTML, use that information
    if (window.librariesLoaded) {
      console.log("Library load status:", window.librariesLoaded);
    }
    
    // Check if Leaflet loaded after initialization and we haven't initialized the map yet
    if (initialized && leafletReady && !mapInitialized) {
      console.log("Leaflet loaded after initial app initialization. Initializing map now.");
      initMap();
      if (filteredData && filteredData.length > 0) {
        // If we already have data, update the map
        try {
          console.log("Updating map with existing data after late Leaflet initialization");
          setTimeout(() => updateMapWithAllData(filteredData.filter(d => !d.removed)), 500);
        } catch (e) {
          console.warn("Error updating map with existing data:", e);
        }
      }
    }
    
    if (plotlyReady && xlsxReady) {
      // Essential libraries are loaded, proceed with initialization
      console.log("Essential libraries loaded successfully");
      
      // Initialize basic features
      createEmptyPlot();
      
      // Initialize Leaflet map if available, otherwise hide the map section
      if (leafletReady) {
        console.log("Leaflet library loaded successfully");
        initMap();
      } else {
        console.warn("Leaflet library not loaded. Map functionality will be disabled.");
        // Don't hide the map section, but add a message
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
          mapContainer.innerHTML = `
            <div style="display: flex; height: 100%; align-items: center; justify-content: center; flex-direction: column; background: rgba(0,0,0,0.05);">
              <i class="fa fa-map-marker" style="font-size: 48px; margin-bottom: 16px; color: #666;"></i>
              <p style="text-align: center; max-width: 70%;">
                Map functionality is temporarily unavailable.<br>
                Please refresh the page to try again.
              </p>
            </div>
          `;
        }
        console.log("Will check for Leaflet in subsequent checks");
      }
      
      // Enable the file upload interaction
      const uploadArea = document.getElementById('upload-area');
      const loadingIndicator = document.getElementById('upload-loading');
      
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
      
      uploadArea.style.opacity = "1";
      uploadArea.style.pointerEvents = "auto";
      
      initialized = true;
      return; // No need to check again, we're initialized
    }
    
    // If still not ready, check again in a moment
    if (!initialized && checkCount < 20) {
      setTimeout(checkLibraries, checkInterval);
    } else if (!initialized) {
      console.error(`Failed to load essential libraries after ${checkCount} attempts`);
      
      // Still enable the UI, but with limited functionality
      const uploadArea = document.getElementById('upload-area');
      const loadingIndicator = document.getElementById('upload-loading');
      
      if (loadingIndicator) {
        loadingIndicator.innerHTML = '<i class="fa fa-exclamation-triangle"></i> <span>Some features may not work properly. Try refreshing the page.</span>';
      }
      
      uploadArea.style.opacity = "1";
      uploadArea.style.pointerEvents = "auto";
    }
  }
  
  // Create an empty Plotly chart
  function createEmptyPlot() {
    const plotDiv = document.getElementById('plotly-chart');
    Plotly.newPlot(plotDiv, [], {
      title: 'PCM Signal Analysis',
      xaxis: { title: 'Station' },
      yaxis: { title: 'Signal (mV)' },
      margin: { t: 50, r: 50, b: 80, l: 80 }
    });
    
    // Attach event listeners for chart
    plotDiv.on('plotly_selected', handlePlotSelection);
    plotDiv.on('plotly_click', handlePlotClick);
  }

  // Add initial styles to upload area to show it's disabled while libraries load
  const uploadArea = document.getElementById('upload-area');
  uploadArea.style.opacity = "0.5";
  uploadArea.style.pointerEvents = "none";
  
  // Start checking for libraries
  checkLibraries();
}

/************************************************************
 * File Selection / Drag-and-Drop
 ************************************************************/
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}

function handleDrop(e) {
  e.preventDefault();
  const files = e.dataTransfer.files;
  handleFileSelection(files);
}

function handleFileSelection(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  // Display file information
  const fileInfoDiv = document.getElementById('file-info');
  const fileNameElement = document.getElementById('file-name');
  
  // Show the file info area
  fileInfoDiv.style.display = 'block';
  
  // Display file name and details
  fileNameElement.textContent = `File: ${file.name} (${formatFileSize(file.size)})`;
  fileNameElement.innerHTML = `<strong>File:</strong> ${file.name} <span class="file-size">(${formatFileSize(file.size)})</span>`;
  
  // Clear data points info until we finish processing
  document.getElementById('data-points-info').textContent = 'Processing file...';

  // Process the file
  processFile(file);
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
      console.log(`Processed ${jsonData.length} rows from Excel file`);
      
      // Debug: Log the first row to see all original fields
      if (jsonData.length > 0) {
        console.log("ORIGINAL EXCEL DATA (first row):", jsonData[0]);
        console.log("Original column count:", Object.keys(jsonData[0]).length);
      }
      
      // Store the original column order and the full original data
      if (jsonData.length > 0) {
        originalColumns = Object.keys(jsonData[0]);
        console.log("Original column order:", originalColumns);
      }
      
      // Store the original complete data for later export
      window.originalExcelData = jsonData;
      
      parsedData = parseExcelData(jsonData);

      // Debug: Compare original data with our parsed data
      if (parsedData.length > 0 && jsonData.length > 0) {
        console.log("PARSED DATA (first row):", parsedData[0]);
        console.log("Parsed data field count:", Object.keys(parsedData[0]).length);
        
        // Check what fields might be missing
        const originalFields = new Set(Object.keys(jsonData[0]));
        const parsedFields = new Set(Object.keys(parsedData[0]));
        const missingFields = [...originalFields].filter(field => !parsedFields.has(field));
        console.log("Fields not preserved in parsed data:", missingFields);
      }

      // Update data points info with statistics
      updateDataPointsInfo(parsedData);
      
      // Populate RID dropdown if multiple RIDs exist
      populateRIDSelector();
      showMessage('File processed successfully!', 'success');
    } catch (error) {
      console.error("Error processing file:", error);
      document.getElementById('data-points-info').innerHTML = 
        `<div class="error-message"><i class="fa fa-exclamation-triangle"></i> Error: ${error.message}</div>`;
      showMessage(`Error processing file: ${error.message}`, 'error');
    }
  };

  reader.onerror = (error) => {
    console.error("FileReader error:", error);
    document.getElementById('data-points-info').innerHTML = 
      `<div class="error-message"><i class="fa fa-exclamation-triangle"></i> Error reading file</div>`;
    showMessage('Error reading file. Please try again.', 'error');
  };
  
  console.log("Starting to read file...");
  reader.readAsArrayBuffer(file);
}

// Function to update data points info in the UI
function updateDataPointsInfo(data) {
  const infoElement = document.getElementById('data-points-info');
  
  if (!data || data.length === 0) {
    infoElement.innerHTML = '<div class="warning-message">No data points found in file.</div>';
    return;
  }
  
  // Count unique RIDs
  const rids = [...new Set(data.map(point => point.rid))].filter(Boolean);
  
  // Count point types
  const pointTypes = {};
  data.forEach(point => {
    // Find point type from various possible fields, trying both camel case and uppercase versions
    let type = 'Unknown';
    
    if (point.pointType) {
      type = point.pointType;
    } else if (point.POINTTYPE) {
      type = point.POINTTYPE;
    } else if (point.pointtype) {
      type = point.pointtype;
    } else if (point.POINT_TYPE) {
      type = point.POINT_TYPE;
    } else if (point.point_type) {
      type = point.point_type;
    } else {
      // Try to find any key that might contain point type information
      const pointTypeKey = Object.keys(point).find(key => 
        key.toLowerCase() === 'pointtype' || 
        key.toLowerCase() === 'point_type' || 
        key.toLowerCase() === 'type'
      );
      
      if (pointTypeKey && point[pointTypeKey]) {
        type = point[pointTypeKey];
      }
    }
    
    pointTypes[type] = (pointTypes[type] || 0) + 1;
  });
  
  // Format the point types
  const pointTypesFormatted = Object.entries(pointTypes)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');
  
  // Build info HTML
  infoElement.innerHTML = `
    <div class="data-stats">
      <div class="stat-row"><strong>Total Points:</strong> ${data.length}</div>
      <div class="stat-row"><strong>Route IDs:</strong> ${rids.length} (${rids.join(', ')})</div>
      <div class="stat-row"><strong>Point Types:</strong> ${pointTypesFormatted}</div>
      <div class="stat-row"><strong>Station Range:</strong> ${formatStation(Math.min(...data.map(p => p.station)))} to ${formatStation(Math.max(...data.map(p => p.station)))}</div>
    </div>
  `;
}

/************************************************************
 * Parse Excel Data
 ************************************************************/
function parseExcelData(jsonData) {
  const result = [];
  
  if (!jsonData || !Array.isArray(jsonData)) {
    console.error("Invalid data format received from Excel file");
    return result;
  }
  
  console.log("Parsing Excel data with", jsonData.length, "rows");
  
  // Debug: Examine the first few rows to understand the structure
  if (jsonData.length > 0) {
    console.log("First Excel row keys:", Object.keys(jsonData[0]));
    console.log("Sample values from first row:", 
      Object.fromEntries(
        Object.entries(jsonData[0]).slice(0, 5) // Just show first 5 entries to avoid cluttering console
      )
    );
    
    // Check for any 'null' or 'undefined' string values that might cause issues
    const problematicFields = Object.entries(jsonData[0])
      .filter(([key, value]) => value === 'null' || value === 'undefined')
      .map(([key]) => key);
    
    if (problematicFields.length > 0) {
      console.warn("Fields with 'null' or 'undefined' string values:", problematicFields);
    }
  }
  
  // Debug: Check for date-related fields in the data
  if (jsonData.length > 0) {
    const sampleRow = jsonData[0];
    const dateTimeFields = Object.keys(sampleRow).filter(key => 
      key.toLowerCase().includes('date') || 
      key.toLowerCase().includes('time') || 
      key.toLowerCase().includes('created') ||
      key.toLowerCase().includes('create')
    );
    console.log("Found date/time related fields in Excel:", dateTimeFields);
    console.log("Sample data for those fields:", dateTimeFields.reduce((obj, key) => {
      obj[key] = sampleRow[key];
      return obj;
    }, {}));
  }
  
  // Track special points for logging
  let specialPointsCount = 0;
  let standardPointsCount = 0;
  
  // Create a field preservation tracker
  const fieldTracker = {};
  if (jsonData.length > 0) {
    Object.keys(jsonData[0]).forEach(key => {
      fieldTracker[key] = { count: 0, preserved: 0 };
    });
  }
  
  for (const row of jsonData) {
    try {
      // Track which fields are present in this row
      Object.keys(row).forEach(key => {
        if (fieldTracker[key]) {
          fieldTracker[key].count++;
        } else {
          fieldTracker[key] = { count: 1, preserved: 0 };
        }
      });
      
      // Extract essential fields we need for functionality
      let stationVal = parseFloat(row['MEAS'] || row['STATION'] || 0);
      if (isNaN(stationVal)) stationVal = 0;
      
      let signalVal = row['SIGNAL'] !== undefined ? parseFloat(row['SIGNAL']) : null;
      if (signalVal !== null && isNaN(signalVal)) signalVal = 0;
      
      // Enhanced point type extraction with case-insensitive lookup
      let pointType = 'N/A';
      
      // First check common field names case-sensitively for performance
      if (row['POINTTYPE'] !== undefined) pointType = String(row['POINTTYPE']);
      else if (row['POINT_TYPE'] !== undefined) pointType = String(row['POINT_TYPE']);
      else if (row['TYPE'] !== undefined) pointType = String(row['TYPE']);
      else {
        // Try to find a field with a case-insensitive match
        const pointTypeKey = Object.keys(row).find(key => 
          key.toUpperCase() === 'POINTTYPE' || 
          key.toUpperCase() === 'POINT_TYPE' || 
          key.toUpperCase() === 'TYPE'
        );
        
        if (pointTypeKey && row[pointTypeKey] !== undefined) {
          pointType = String(row[pointTypeKey]);
        }
      }
      
      let ridVal = row['RID'] ? String(row['RID']) : 'DEFAULT';
      
      let xVal = parseFloat(row['X'] || row['LONGITUDE'] || row['LON'] || 0);
      if (isNaN(xVal)) xVal = 0;
      
      let yVal = parseFloat(row['Y'] || row['LATITUDE'] || row['LAT'] || 0);
      if (isNaN(yVal)) yVal = 0;

      // Check if this is a special point type that should be included even with blank/invalid signal
      const pointTypeUpper = (pointType || '').toString().toUpperCase().trim();
      const isSpecialPointType = pointTypeUpper === 'POINT GENERIC' || 
                                 pointTypeUpper === 'SETUP LOCATION';
      
      // For special point types, log but don't treat as warning
      if (signalVal === null || signalVal <= 0) {
        if (isSpecialPointType) {
          console.log(`Special point type '${pointType}' found with null/invalid signal at station ${stationVal}`);
        } else {
          console.warn(`Invalid or missing signal value: ${signalVal}`);
        }
      }

      // Calculate current in dBmA: 20 * LOG10(signalVal)
      // If signalVal is 0 or negative, handle gracefully
      let currentVal = null;
      if (signalVal > 0) {
        try {
          currentVal = (Math.log10(signalVal) * 20);
          // Check if the result is valid
          if (isNaN(currentVal) || !isFinite(currentVal)) {
            console.warn(`Invalid current calculation result for signal: ${signalVal}, result: ${currentVal}`);
            currentVal = null;
          }
        } catch (error) {
          console.warn(`Error calculating current for signal: ${signalVal}`, error);
          currentVal = null;
        }
      }

      // Determine if we should add this data point
      const hasValidStationAndCurrent = stationVal !== null && stationVal !== undefined && !isNaN(stationVal) && 
                                       currentVal !== null && currentVal !== undefined && !isNaN(currentVal);
      
      // Add point if it has valid station/current OR it's a special point type with valid station
      if (hasValidStationAndCurrent || (isSpecialPointType && stationVal !== null && !isNaN(stationVal))) {
        // Create a new dataPoint with all original row data first
        const dataPoint = {...row};
        
        // Track which fields are preserved
        Object.keys(row).forEach(key => {
          if (fieldTracker[key]) {
            fieldTracker[key].preserved++;
          }
        });
        
        // Then add our processed fields, which may override some original fields
        dataPoint.station = stationVal;
        dataPoint.signal = signalVal;
        dataPoint.current = currentVal;
        dataPoint.pointType = pointType;
        dataPoint.x = xVal;  // Usually longitude
        dataPoint.y = yVal;  // Usually latitude
        dataPoint.longitude = xVal;
        dataPoint.latitude = yVal;
        dataPoint.rid = ridVal;
        dataPoint.group = null; // To be assigned by user if needed
        dataPoint.removed = false; // Track if point is removed
        dataPoint.isSpecialPoint = isSpecialPointType; // Flag for special point types
        
        // Add any fields from the metadataFields list that exist in the row
        // Note: This is redundant now that we copy all fields, but keeping for any special processing
        const metadataFields = [
          'SURVEYOR', 'COLLECTOR', 'DATE', 'TIME', 'CREATEDON', 'CREATED_ON',
          'MEAS', 'DIRECTIONOFSIGNAL', 'DIRECTION_OF_SIGNAL',
          'MEASUREMENT_TYPE', 'SIGNAL_COMMENT'
        ];
        
        metadataFields.forEach(field => {
          // Check if the field exists in the row (using case-insensitive match)
          const foundKey = Object.keys(row).find(key => key.toUpperCase() === field);
          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
            // Use camelCase for consistent property naming
            let camelCaseKey = foundKey.toLowerCase().replace(/(_)([a-z])/g, (m, p1, p2) => p2.toUpperCase());
            
            // Special handling for direction of signal field
            if (field === 'DIRECTIONOFSIGNAL' || field === 'DIRECTION_OF_SIGNAL') {
              camelCaseKey = 'directionOfSignal';
            }
            
            // Handle collector/surveyor consistently
            if (field === 'SURVEYOR' || field === 'COLLECTOR') {
              // Use 'collector' as the standard key for both
              camelCaseKey = 'collector';
            }
            
            // Handle created on field name consistently 
            if (field === 'CREATEDON' || field === 'CREATED_ON') {
              camelCaseKey = 'createdOn';
            }
            
            dataPoint[camelCaseKey] = row[foundKey];
          }
        });
        
        // Also check for any common variations of field names that might be in the data
        // but don't capture everything to keep the data clean
        const keyMap = {
          'LON': 'longitude',
          'LONGITUDE': 'longitude',
          'LAT': 'latitude',
          'LATITUDE': 'latitude',
          'COMMENT': 'comments',
          'COMMENTS': 'comments',
          'POINTTYPE': 'pointType',
          'POINT_TYPE': 'pointType',
          'TYPE': 'pointType',
          'CREATED': 'createdOn',
          'CREATEDON': 'createdOn',
          'CREATED_ON': 'createdOn',
          'CREATION_DATE': 'createdOn',
          'CREATION_TIME': 'createdOn',
          'SURVEYOR_NAME': 'collector',
          'TECHNICIAN': 'collector'
        };
        
        // Apply mappings for common field variations
        Object.keys(row).forEach(key => {
          const upperKey = key.toUpperCase();
          if (keyMap[upperKey] && row[key] !== undefined && row[key] !== null && row[key] !== '') {
            dataPoint[keyMap[upperKey]] = row[key];
          }
        });
        
        // Handle CreatedOn field - parse into date and time with specific formatting
        if (dataPoint.createdOn && !dataPoint.date) {
          try {
            const dateObj = new Date(dataPoint.createdOn);
            if (!isNaN(dateObj.getTime())) {
              // Format date as MM/DD/YYYY
              const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
              const day = dateObj.getDate().toString().padStart(2, '0');
              const year = dateObj.getFullYear();
              dataPoint.date = `${month}/${day}/${year}`;
              
              // Format time as HH:MM:SS
              const hours = dateObj.getHours().toString().padStart(2, '0');
              const minutes = dateObj.getMinutes().toString().padStart(2, '0');
              const seconds = dateObj.getSeconds().toString().padStart(2, '0');
              dataPoint.time = `${hours}:${minutes}:${seconds}`;
            }
          } catch (e) {
            console.warn("Could not parse createdOn date:", dataPoint.createdOn);
          }
        }
        
        // Store the original raw data as a backup
        dataPoint._originalData = {...row};
        
        result.push(dataPoint);
        
        // Increment appropriate counter
        if (isSpecialPointType) {
          specialPointsCount++;
        } else {
          standardPointsCount++;
        }
      } else {
        console.warn(`Skipping invalid data point: station=${stationVal}, signal=${signalVal}, current=${currentVal}`);
      }
    } catch (error) {
      console.warn("Error processing Excel row:", error, row);
    }
  }

  console.log(`Parsed ${result.length} total data points (${standardPointsCount} standard, ${specialPointsCount} special)`);
  
  // Output field preservation statistics
  const fieldStats = Object.entries(fieldTracker).map(([field, stats]) => {
    return { 
      field, 
      count: stats.count, 
      preserved: stats.preserved,
      preservationRate: stats.count > 0 ? Math.round((stats.preserved / stats.count) * 100) + '%' : 'N/A'
    };
  });
  
  console.log("Field preservation statistics:", fieldStats);
  
  // Check for any fields with low preservation rates
  const lowPreservationFields = fieldStats.filter(
    stat => stat.count > 0 && (stat.preserved / stat.count) < 0.9
  );
  
  if (lowPreservationFields.length > 0) {
    console.warn("WARNING: Some fields have low preservation rates:", lowPreservationFields);
  }
  
  // Debug: Log date and time information for the first few data points
  if (result.length > 0) {
    console.log("Sample data point metadata:", result.slice(0, 3).map(pt => ({
      createdOn: pt.createdOn,
      date: pt.date,
      time: pt.time,
      collector: pt.collector,
      directionOfSignal: pt.directionOfSignal
    })));
    
    // Check what fields we have in the first processed data point
    console.log("First processed data point fields:", Object.keys(result[0]));
    console.log("Field count in processed data:", Object.keys(result[0]).length);
    
    // Compare with original
    if (jsonData.length > 0) {
      const originalFields = Object.keys(jsonData[0]);
      const processedFields = Object.keys(result[0]);
      const missingFields = originalFields.filter(field => !processedFields.includes(field));
      console.log("Fields possibly missing after processing:", missingFields);
      
      if (missingFields.length === 0) {
        console.log("All original fields preserved in processed data!");
      }
    }
  }
  
  return result;
}

/************************************************************
 * Populate RID Selector
 ************************************************************/
function populateRIDSelector() {
  const ridSelector = document.getElementById('rid-selector');
  const ridSelect = document.getElementById('rid-select');

  // Collect unique RIDs
  const uniqueRIDs = [...new Set(parsedData.map(d => d.rid))];
  
  // If only one RID, hide the selector and filter automatically
  if (uniqueRIDs.length === 1) {
    ridSelector.style.display = 'none';
    currentRID = uniqueRIDs[0];
    filterDataByRID(currentRID);
  } else {
    ridSelector.style.display = 'flex';
    // Clear existing options
    ridSelect.innerHTML = '';
    // Create an option for each unique RID
    uniqueRIDs.forEach(rid => {
      const opt = document.createElement('option');
      opt.value = rid;
      opt.textContent = rid;
      ridSelect.appendChild(opt);
    });
    // Select the first RID by default
    currentRID = uniqueRIDs[0];
    ridSelect.value = currentRID;
    filterDataByRID(currentRID);
  }
}

/************************************************************
 * Handle RID Selection
 ************************************************************/
function handleRIDSelection(event) {
  // Clear selected groups when changing RIDs
  selectedGroups = [];
  
  // Update current RID and filter data
  currentRID = event.target.value;
  filterDataByRID(currentRID);
}

/************************************************************
 * Filter Data by RID
 ************************************************************/
function filterDataByRID(rid) {
  if (!parsedData || parsedData.length === 0) {
    console.warn("No data to filter by RID");
    return;
  }
  
  try {
    currentRID = rid;
    
    // If no rid specified, use the first one available
    if (!rid) {
      const availableRIDs = [...new Set(parsedData.map(d => d.rid).filter(r => r))];
      if (availableRIDs.length > 0) {
        rid = availableRIDs[0];
        currentRID = rid;
      } else {
        console.warn("No RIDs found in data");
        filteredData = [];
        return;
      }
    }
    
    if (rid && !parsedData.some(d => d && d.rid === rid)) {
      console.warn(`RID "${rid}" not found in data`);
      filteredData = [];
      return;
    }
    
    // Check if this is the first time viewing this RID
    const isFirstView = !viewedRIDs.has(rid);
    if (isFirstView) {
      console.log(`First time viewing RID: ${rid} - will auto-fit to screen`);
      viewedRIDs.add(rid);
    }
    
    console.log(`Filtering data for RID: ${rid}`);
    filteredData = parsedData.filter(d => d && d.rid === rid);
    
    // Ensure we have valid data points with non-null values for standard points
    // Or valid special points for POINT GENERIC and SETUP LOCATION
    const validFilteredData = filteredData.filter(d => 
      d && d.station != null && !isNaN(d.station) && 
      (
        // Standard points need valid current values
        (d.current != null && !isNaN(d.current) && d.removed === false) ||
        // Special points only need valid station and correct type
        (d.isSpecialPoint === true && d.removed === false)
      )
    );
    
    if (validFilteredData.length === 0) {
      console.warn(`No valid data points found for RID: ${rid}`);
      showMessage(`No valid data points found for Route ID: ${rid}`, 'warning');
      return;
    }
    
    console.log(`Found ${validFilteredData.length} valid data points for RID: ${rid}`);
    
    // Sort by station
    validFilteredData.sort((a, b) => a.station - b.station);
    
    // Instead of clearing groups for other RIDs, we keep all groups and only display the current ones
    // Note: Removed line that filters groups by RID
    updateGroupList(); // This will now filter by RID for display purposes only
    
    // Update the plot with the filtered data - always auto-fit when switching RIDs
    updatePlot(validFilteredData, true);
    
    // Update map if available - wrapped in try/catch to prevent errors
    try {
      if (typeof updateMapWithAllData === 'function' && mapInitialized && mapInstance) {
        updateMapWithAllData(validFilteredData);
      }
    } catch (mapError) {
      console.warn("Error updating map (non-critical):", mapError);
    }
  } catch (error) {
    console.error(`Error filtering data by RID ${rid}:`, error);
    showMessage(`Error filtering data: ${error.message}`, 'error');
  }
}

/************************************************************
 * Update Plot (Plotly)
 ************************************************************/
function updatePlot(dataToDisplay, isFirstView = false) {
  console.group("updatePlot");
  
  if (!dataToDisplay || dataToDisplay.length === 0) {
    console.warn("No data to display in the plot");
    console.groupEnd();
    return;
  }
  
  // Always filter out removed points to ensure they stay removed
  dataToDisplay = dataToDisplay.filter(pt => !pt.removed);
  
  // Sort data by station to ensure proper line connections
  dataToDisplay.sort((a, b) => a.station - b.station);
  
  // Diagnostic information
  console.log(`Updating plot with ${dataToDisplay.length} data points, isFirstView: ${isFirstView}`);
  console.log("Data sample:", dataToDisplay.slice(0, 3));
  
  // Validate data points
  const hasInvalidStations = dataToDisplay.some(pt => pt.station == null || isNaN(pt.station));
  const hasInvalidCurrents = dataToDisplay.some(pt => pt.current == null || isNaN(pt.current) && !pt.isSpecialPoint);
  
  if (hasInvalidStations || hasInvalidCurrents) {
    console.warn("Data contains invalid points:",
      hasInvalidStations ? "Some stations are invalid" : "",
      hasInvalidCurrents ? "Some current values are invalid" : "");
  }
  
  // Get the plot div
  const plotDiv = document.getElementById('plotly-chart');
  
  // Save current zoom state if it exists and we're not doing first view
  let xRange = null;
  let yRange = null;
  if (!isFirstView && plotDiv && plotDiv._fullLayout) {
    if (plotDiv._fullLayout.xaxis && plotDiv._fullLayout.xaxis.range) {
      xRange = plotDiv._fullLayout.xaxis.range.slice();
    }
    if (plotDiv._fullLayout.yaxis && plotDiv._fullLayout.yaxis.range) {
      yRange = plotDiv._fullLayout.yaxis.range.slice();
    }
  }

  // Separate standard data points from special points
  const standardPoints = dataToDisplay.filter(pt => !pt.isSpecialPoint);
  const specialPoints = dataToDisplay.filter(pt => pt.isSpecialPoint);
  
  // Prepare trace for standard points
  const xVals = standardPoints.map(pt => pt.station);
  const yVals = standardPoints.map(pt => pt.current);

  // Make sure data is valid
  if (xVals.some(x => x == null) || yVals.some(y => y == null)) {
    console.warn("Some data points have null values:", 
      xVals.filter(x => x == null).length, "null x values,", 
      yVals.filter(y => y == null).length, "null y values");
  }

  // Main trace for current (scattergl)
  const scatterTrace = {
    x: xVals,
    y: yVals,
    mode: 'lines+markers',
    type: 'scattergl',
    name: 'Current (dBmA)',
    marker: {
      size: 6,
      color: '#00A3E0'
    },
    line: {
      color: '#00A3E0',
      width: 2,
      shape: 'linear',
      connectgaps: true,  // Connect gaps but ensure points are properly sorted
      smoothing: 0.2      // Add slight smoothing to improve appearance
    },
    hoverinfo: 'text',
    text: standardPoints.map(pt => {
      // For debug: log the first few points to see what fields they have
      if (standardPoints.indexOf(pt) < 3) {
        console.log("Point in hover text:", {
          hasCreatedOn: !!pt.createdOn,
          hasDate: !!pt.date,
          hasTime: !!pt.time,
          createdOn: pt.createdOn,
          date: pt.date,
          time: pt.time
        });
      }
      
      // Safe value formatter with null check
      const formatValue = (value, decimals = 2) => {
        return value != null ? value.toFixed(decimals) : 'N/A';
      };
      
      // Build hover text with only the specified fields
      let hoverText = `Station: ${formatStation(pt.station)}<br>` +
                      `Current: ${formatValue(pt.current, 2)} dBmA<br>` +
                      `Signal: ${formatValue(pt.signal, 4)} mA`;
      
      // Add only the specific requested metadata fields
      if (pt.pointType) hoverText += `<br>Point Type: ${pt.pointType}`;
      if (pt.longitude || pt.lon) hoverText += `<br>Lon: ${pt.longitude || pt.lon}`;
      if (pt.latitude || pt.lat) hoverText += `<br>Lat: ${pt.latitude || pt.lat}`;
      if (pt.rid) hoverText += `<br>RID: ${pt.rid}`;
      if (pt.meas) hoverText += `<br>Meas: ${pt.meas}`;
      if (pt.directionOfSignal) hoverText += `<br>Direction of Signal: ${pt.directionOfSignal}`;
      
      // Handle createdOn field - split into date and time if available
      if (pt.createdOn) {
        try {
          // Try to parse the date string
          const dateObj = new Date(pt.createdOn);
          if (!isNaN(dateObj.getTime())) {
            // Format date as MM/DD/YYYY
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const day = dateObj.getDate().toString().padStart(2, '0');
            const year = dateObj.getFullYear();
            const dateStr = `${month}/${day}/${year}`;
            
            // Format time as HH:MM:SS
            const hours = dateObj.getHours().toString().padStart(2, '0');
            const minutes = dateObj.getMinutes().toString().padStart(2, '0');
            const seconds = dateObj.getSeconds().toString().padStart(2, '0');
            const timeStr = `${hours}:${minutes}:${seconds}`;
            
            hoverText += `<br>Date: ${dateStr}<br>Time: ${timeStr}`;
          } else {
            // If parsing fails, just show the original string
            hoverText += `<br>Created On: ${pt.createdOn}`;
          }
        } catch (e) {
          // If any error occurs in parsing, show the original
          hoverText += `<br>Created On: ${pt.createdOn}`;
        }
      } else {
        // If we have separate date and time fields, show those
        if (pt.date) hoverText += `<br>Date: ${pt.date}`;
        if (pt.time) hoverText += `<br>Time: ${pt.time}`;
      }
      
      // Add collector information if available
      if (pt.collector) hoverText += `<br>Collector: ${pt.collector}`;
      if (pt.surveyor && !pt.collector) hoverText += `<br>Collector: ${pt.surveyor}`;
      
      return hoverText;
    })
  };

  // Create data array that will hold all our traces
  const data = [scatterTrace];
  
  // Get the selected groups (filtered by current RID)
  const visibleGroups = customGroups.filter(g => 
    g.rid === currentRID && 
    g.visible && 
    g.points.length >= 2 &&
    (selectedGroups.length === 0 || selectedGroups.includes(g.id))
  );
  
  if (visibleGroups.length === 0) {
    // If no groups are selected or available, calculate percentage changes for all data
    const percentageChanges = calculatePercentageChange(standardPoints);
    
    if (percentageChanges.length > 0) {
      // For non-grouped data, we'll use the traditional bar chart approach
      const barTrace = {
        x: percentageChanges.map(pc => pc.station),
        y: percentageChanges.map(pc => pc.percentChange),
        type: 'bar',
        name: '% Change/100ft',
        marker: {
          color: 'rgba(255, 165, 0, 0.7)'
        },
        yaxis: 'y2',
        hoverinfo: 'text',
        text: percentageChanges.map(pc => {
          // Safe value formatter with null check
          const formatValue = (value, decimals = 2) => {
            return value != null ? value.toFixed(decimals) : 'N/A';
          };
          
          return `Station: ${formatStation(pc.station)}<br>` +
                 `Change: ${pc.percentChange != null ? formatValue(pc.percentChange, 2) : 'N/A'}%/100ft<br>` +
                 `Distance: ${formatValue(pc.distance)} ft`;
        })
      };
      
      data.push(barTrace);
    }
  } else {
    // Sort groups by their first station point for transition calculations
    visibleGroups.sort((a, b) => {
      const aFirstStation = Math.min(...a.points.map(p => p.station));
      const bFirstStation = Math.min(...b.points.map(p => p.station));
      return aFirstStation - bFirstStation;
    });
    
    // For each group, create a single solid bar
    visibleGroups.forEach(group => {
      // Calculate percentage change for this group
      const groupPercentageChange = calculatePercentageChange(group.points, group);
      
      if (groupPercentageChange.length > 0) {
        // Get the first and last points in the group (already sorted by station in calculatePercentageChange)
        const sortedPoints = [...group.points].sort((a, b) => a.station - b.station);
        const startStation = sortedPoints[0].station;
        const endStation = sortedPoints[sortedPoints.length - 1].station;
        
        // Extract the single percentage change value
        const percentValue = groupPercentageChange[0].percentChange;
        
        // Create a solid bar for this group using a fill area approach
        const solidBarTrace = {
          x: [startStation, startStation, endStation, endStation],
          y: [0, percentValue, percentValue, 0],
          fill: 'toself',
          fillcolor: group.color.replace('rgb', 'rgba').replace(')', ', 0.7)'),
          line: {
            color: group.color,
            width: 1
          },
          name: `${percentValue.toFixed(2)}%/100ft`,
          yaxis: 'y2',
          hoverinfo: 'text',
          text: `Group: ${group.name}<br>` +
                `Station Range: ${formatStation(startStation)} - ${formatStation(endStation)}<br>` +
                `Change: ${percentValue.toFixed(2)}%/100ft<br>` +
                `Points in Group: ${sortedPoints.length}`,
          type: 'scatter'
        };
        
        data.push(solidBarTrace);
      }
    });
    
    // Calculate and add transition bars between groups
    for (let i = 0; i < visibleGroups.length - 1; i++) {
      const currentGroup = visibleGroups[i];
      const nextGroup = visibleGroups[i + 1];
      
      // Get the last point of current group and first point of next group
      const currentGroupPoints = [...currentGroup.points].sort((a, b) => a.station - b.station);
      const nextGroupPoints = [...nextGroup.points].sort((a, b) => a.station - b.station);
      
      const lastPointCurrent = currentGroupPoints[currentGroupPoints.length - 1];
      const firstPointNext = nextGroupPoints[0];
      
      // Skip if points are missing critical data
      if (!lastPointCurrent || !firstPointNext || 
          lastPointCurrent.current == null || firstPointNext.current == null) {
        continue;
      }
      
      // Calculate distance between groups
      const distance = firstPointNext.station - lastPointCurrent.station;
      
      // Skip if the groups are too close or too far
      if (distance < 0.1 || distance > 1000) {
        continue;
      }
      
      // Calculate percentage change between the last point of current group and first point of next group
      const referenceValue = lastPointCurrent.current;
      const currentValue = firstPointNext.current;
      const percentChange = Math.abs((referenceValue - currentValue) / referenceValue) * 100 * (100 / distance);
      
      // Cap extreme values for display
      const cappedPercentChange = percentChange > 10 ? 10 : percentChange;
      
      // Create a transition bar
      const transitionTrace = {
        x: [lastPointCurrent.station, lastPointCurrent.station, firstPointNext.station, firstPointNext.station],
        y: [0, cappedPercentChange, cappedPercentChange, 0],
        fill: 'toself',
        fillcolor: 'rgba(150, 150, 150, 0.5)', // Gray color for transitions
        line: {
          color: 'rgba(100, 100, 100, 0.8)',
          width: 1,
          dash: 'dot'
        },
        name: `${cappedPercentChange.toFixed(2)}%/100ft`,
        yaxis: 'y2',
        hoverinfo: 'text',
        text: `Transition: ${currentGroup.name} → ${nextGroup.name}<br>` +
              `Station Range: ${formatStation(lastPointCurrent.station)} - ${formatStation(firstPointNext.station)}<br>` +
              `Change: ${cappedPercentChange.toFixed(2)}%/100ft`,
        type: 'scatter'
      };
      
      data.push(transitionTrace);
    }
  }

  // Add trace for POINT GENERIC points
  const pointGenericPoints = specialPoints.filter(pt => 
    pt.pointType && pt.pointType.toUpperCase() === 'POINT GENERIC');
    
  const pointGenericTrace = {
    x: pointGenericPoints.map(pt => pt.station),
    y: pointGenericPoints.map(() => {
      // Get a y-value at the bottom of the chart but visible
      const minY = Math.min(...standardPoints.map(p => p.current).filter(y => y !== null && !isNaN(y)));
      return minY * 0.9; // Place slightly below the min value
    }),
    mode: 'markers',
    type: 'scatter',
    name: 'Point Generic',
    marker: {
      size: 12,
      symbol: 'square',
      color: '#ff6347', // Tomato red
      line: {
        width: 2,
        color: '#000'
      }
    },
    hoverinfo: 'text',
    text: pointGenericPoints.map(pt => 
      `Station: ${formatStation(pt.station)}<br>` +
      `Type: Point Generic<br>` +
      `Location Marker`
    )
  };

  // Add trace for SETUP LOCATION points
  const setupLocationPoints = specialPoints.filter(pt => 
    pt.pointType && pt.pointType.toUpperCase() === 'SETUP LOCATION');
    
  const setupLocationTrace = {
    x: setupLocationPoints.map(pt => pt.station),
    y: setupLocationPoints.map(() => {
      // Get a y-value at the bottom of the chart but visible
      const minY = Math.min(...standardPoints.map(p => p.current).filter(y => y !== null && !isNaN(y)));
      return minY * 0.85; // Place slightly lower than the POINT GENERIC markers
    }),
    mode: 'markers',
    type: 'scatter',
    name: 'Setup Location',
    marker: {
      size: 12,
      symbol: 'triangle-up',
      color: '#32cd32', // Lime green
      line: {
        width: 2,
        color: '#000'
      }
    },
    hoverinfo: 'text',
    text: setupLocationPoints.map(pt => 
      `Station: ${formatStation(pt.station)}<br>` +
      `Type: Setup Location<br>` +
      `Location Marker`
    )
  };

  // Create evenly-spaced tick values and formatted tick labels
  const minStation = Math.min(...dataToDisplay.map(pt => pt.station));
  const maxStation = Math.max(...dataToDisplay.map(pt => pt.station));
  const stepSize = (maxStation - minStation) / 10; // 10 ticks
  
  // Generate the tick values
  const tickVals = [];
  const tickText = [];
  
  if (minStation !== Infinity && maxStation !== -Infinity && !isNaN(stepSize) && isFinite(stepSize) && stepSize > 0) {
    console.log(`X-axis range: ${minStation} to ${maxStation}, step size: ${stepSize}`);
    for (let i = 0; i <= 10; i++) {
      const tickValue = minStation + (stepSize * i);
      tickVals.push(tickValue);
      tickText.push(formatStation(tickValue));
    }
  } else {
    console.warn("Invalid data range for X-axis ticks:", 
      {minStation, maxStation, stepSize});
  }

  const layout = {
    hovermode: 'closest',
    margin: { l: 60, r: 60, t: 30, b: 60 },
    showlegend: true,
    legend: {
      bgcolor: 'rgba(0,0,0,0.1)',
      bordercolor: 'rgba(255,255,255,0.2)',
      borderwidth: 1,
      font: { color: '#fff' },
      x: 1,
      xanchor: 'right'
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0.2)',
    xaxis: {
      title: {
        text: 'Station',
        font: {
          size: 16,
          color: '#fff'
        }
      },
      // Custom station format function
      tickformat: '',
      tickmode: tickVals.length > 0 ? 'array' : 'auto',
      tickvals: tickVals,
      ticktext: tickText,
      gridcolor: 'rgba(255,255,255,0.1)',
      zerolinecolor: 'rgba(255,255,255,0.3)',
      tickfont: { color: '#fff' }
    },
    yaxis: {
      title: {
        text: 'Current (dBmA)',
        font: {
          size: 16,
          color: '#fff'
        }
      },
      gridcolor: 'rgba(255,255,255,0.1)',
      zerolinecolor: 'rgba(255,255,255,0.3)',
      tickfont: { color: '#fff' }
    },
    yaxis2: {
      title: {
        text: '% Current Change/100 ft  ',  // Added extra spaces for padding
        font: {
          size: 16,
          color: 'rgb(255, 165, 0)'
        }
      },
      overlaying: 'y',
      side: 'right',
      showgrid: false,
      tickfont: { color: 'rgb(255, 165, 0)' },
      tickformat: '.1f',  // Changed from .1% to .1f to show plain numbers
      dtick: 0.5,  // Changed from 0.005 to 0.5 to show ticks every 0.5% instead of 0.005%
      rangemode: 'nonnegative'
    }
  };

  // Add special point traces if they have points
  if (pointGenericPoints.length > 0) {
    data.push(pointGenericTrace);
  }
  
  if (setupLocationPoints.length > 0) {
    data.push(setupLocationTrace);
  }

  // Add custom group traces if they exist
  customGroups.forEach(group => {
    if (group.visible && group.rid === currentRID) {
      const groupPoints = group.points;
      data.push({
        x: groupPoints.map(pt => pt.station),
        y: groupPoints.map(pt => pt.current),
        mode: 'markers',
        type: 'scattergl',
        name: group.name,
        marker: {
          size: 8,
          color: group.color
        },
        hoverinfo: 'text',
        text: groupPoints.map(pt => {
          // Safe value formatter with null check
          const formatValue = (value, decimals = 2) => {
            return value != null ? value.toFixed(decimals) : 'N/A';
          };
          
          return `Group: ${group.name}<br>` +
                 `Station: ${formatStation(pt.station)}<br>` +
                 `Current: ${formatValue(pt.current)} dBmA`;
        })
      });
    }
  });

  // Save the active modebar button before updating the plot
  let activeButton = null;
  if (document.querySelector('.modebar-btn.active')) {
    activeButton = document.querySelector('.modebar-btn.active').getAttribute('data-title');
    console.log('Saving active tool:', activeButton);
  }

  // Update the chart
  Plotly.react('plotly-chart', data, layout, {
    responsive: true,
    scrollZoom: true,
    displayModeBar: true,
    modeBarButtonsToAdd: [
      'select2d',
      'lasso2d',
      'zoomIn2d',
      'zoomOut2d',
      'autoScale2d',
      'resetScale2d'
    ],
    modeBarButtonsToRemove: [
      'toImage', 
      'sendDataToCloud'
    ]
  });

  // Restore the previous zoom if it exists
  if (xRange && yRange) {
    Plotly.relayout('plotly-chart', {
      'xaxis.range': xRange,
      'yaxis.range': yRange
    });
  }

  // Reactivate the previously active tool if one was active
  if (activeButton) {
    setTimeout(() => {
      const buttons = document.querySelectorAll('.modebar-btn');
      for (const button of buttons) {
        if (button.getAttribute('data-title') === activeButton) {
          button.click();
          console.log('Restored active tool:', activeButton);
          break;
        }
      }
    }, 100); // Short delay to ensure the modebar is fully initialized
  }
  
  console.groupEnd();
}

/************************************************************
 * Handle Plot Selection
 ************************************************************/
function handlePlotSelection(eventData) {
  if (!eventData || !eventData.points) return;
  selectedDataPoints = [];
  
  // Keep track of points we skip because they're already in a group
  let alreadyGroupedCount = 0;

  for (let point of eventData.points) {
    if (!point || point.x == null) continue; // Skip invalid points
    
    let stationValue = point.x;
    // Find matching data in filteredData
    let matchIndex = filteredData.findIndex(d => d.station === stationValue && d.removed === false);
    
    if (matchIndex !== -1) {
      // Check if this point is already in a group for the current RID
      const pointAlreadyInGroup = customGroups.some(group => 
        group.rid === currentRID && 
        group.points.some(groupPoint => 
          groupPoint.station === filteredData[matchIndex].station
        )
      );
      
      if (pointAlreadyInGroup) {
        // Skip this point as it's already in a group
        alreadyGroupedCount++;
        continue;
      }
      
      // Add the point to our selection if it's not already in a group
      selectedDataPoints.push(matchIndex);
    }
  }

  // Show a message if we skipped some points that were already in groups
  if (alreadyGroupedCount > 0) {
    showMessage(`Skipped ${alreadyGroupedCount} point(s) that are already in groups`, 'info');
  }

  // Show selection info
  displaySelectionInfo();
  
  // Update the group name input with the next group number
  if (selectedDataPoints.length > 0) {
    const groupNameInput = document.getElementById('group-name-input');
    // Count how many groups already exist for the current RID
    const ridGroupCount = customGroups.filter(g => g.rid === currentRID).length;
    // Use that count + 1 for the new group number 
    groupNameInput.value = `Group ${ridGroupCount + 1}`;
    // Focus the input so the user can easily edit if desired
    groupNameInput.focus();
    // Select the text so typing automatically replaces it
    groupNameInput.select();
  }
}

/************************************************************
 * Handle Plot Click (for remove mode)
 ************************************************************/
function handlePlotClick(eventData) {
  if (!isRemoveMode || !eventData || !eventData.points) return;
  
  const point = eventData.points[0];
  if (!point) return;
  let stationValue = point.x;
  
  // Check if this point is already in a group
  const pointData = filteredData.find(d => d.station === stationValue && d.removed === false);
  if (!pointData) return;
  
  const pointAlreadyInGroup = customGroups.some(group => 
    group.rid === currentRID && 
    group.points.some(groupPoint => groupPoint.station === stationValue)
  );
  
  if (pointAlreadyInGroup) {
    showMessage(`Cannot remove point at station ${formatStation(stationValue)} as it belongs to a group`, 'warning');
    return;
  }
  
  let matchIndex = filteredData.findIndex(d => d.station === stationValue && d.removed === false);
  
  if (matchIndex !== -1) {
    filteredData[matchIndex].removed = true;
    removedPoints.push(filteredData[matchIndex]);
    showMessage(`Point at station ${formatStation(stationValue)} removed.`, 'info');
    
    // Get visible data points and ensure they're sorted
    const visibleData = filteredData.filter(d => !d.removed);
    visibleData.sort((a, b) => a.station - b.station);
    
    // Re-render chart with sorted data
    updatePlot(visibleData);
  }
}

/************************************************************
 * Display Selection Info
 ************************************************************/
function displaySelectionInfo() {
  const selectionInfoDiv = document.getElementById('selection-info');
  const selectionCount = document.getElementById('selection-count');
  const selectionStats = document.getElementById('selection-stats');
  
  // If no selection, hide the info div
  if (selectedDataPoints.length === 0) {
    selectionInfoDiv.style.display = 'none';
    return;
  }
  
  // Show the info div
  selectionInfoDiv.style.display = 'block';
  
  // Update selection count
  selectionCount.textContent = selectedDataPoints.length;
  
  // Get the selected points from the filtered data using indexes
  const selectedPoints = selectedDataPoints.map(index => filteredData[index]);
  
  // Safety check - make sure we have valid points
  if (!selectedPoints.length || selectedPoints.some(p => p == null)) {
    selectionStats.innerHTML = '<div class="warning-message"><i class="fa fa-exclamation-triangle"></i> Error processing selection data</div>';
    return;
  }
  
  // Calculate basic stats like min, max, average, etc.
  try {
    const stats = {
      minStation: Math.min(...selectedPoints.map(p => p.station || 0)),
      maxStation: Math.max(...selectedPoints.map(p => p.station || 0)),
      spanStation: 0,
      minSignal: Math.min(...selectedPoints.map(p => p.signal || 0)),
      maxSignal: Math.max(...selectedPoints.map(p => p.signal || 0)),
      avgSignal: 0,
      minCurrent: Math.min(...selectedPoints.filter(p => p.current != null).map(p => p.current)),
      maxCurrent: Math.max(...selectedPoints.filter(p => p.current != null).map(p => p.current)),
      avgCurrent: 0
    };
    
    // Calculate span and averages safely
    stats.spanStation = stats.maxStation - stats.minStation;
    stats.avgSignal = selectedPoints.reduce((sum, p) => sum + (p.signal || 0), 0) / selectedPoints.length;
    
    // Calculate average current only for points with valid current values
    const pointsWithCurrent = selectedPoints.filter(p => p.current != null);
    stats.avgCurrent = pointsWithCurrent.length ? 
      pointsWithCurrent.reduce((sum, p) => sum + p.current, 0) / pointsWithCurrent.length : 0;
    
    // Format the stats
    const formatStat = (value, decimals = 2) => {
      if (value == null || isNaN(value)) {
        return 'N/A';
      }
      return typeof value === 'number' ? value.toFixed(decimals) : value;
    };
    
    // Build the stats HTML
    selectionStats.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item">
          <strong>Station Range:</strong> 
          ${formatStation(stats.minStation)} to ${formatStation(stats.maxStation)} 
          (${formatStat(stats.spanStation)} units)
        </div>
        <div class="stat-item">
          <strong>Signal Range:</strong> 
          ${formatStat(stats.minSignal, 4)} to ${formatStat(stats.maxSignal, 4)} mA
          (Avg: ${formatStat(stats.avgSignal, 4)} mA)
        </div>
        <div class="stat-item">
          <strong>Current Range:</strong> 
          ${formatStat(stats.minCurrent)} to ${formatStat(stats.maxCurrent)} dBmA
          (Avg: ${formatStat(stats.avgCurrent)} dBmA)
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Error calculating selection stats:", error);
    selectionStats.innerHTML = '<div class="warning-message"><i class="fa fa-exclamation-triangle"></i> Error processing selection data</div>';
  }
}

/************************************************************
 * Grouping (Create Custom Group)
 ************************************************************/
function handleApplyCustomGroup() {
  // Check if we have selected data points
  if (selectedDataPoints.length === 0) {
    showMessage('Please select data points before creating a group', 'warning');
    return;
  }

  // Get the group name from the input
  const groupNameInput = document.getElementById('group-name-input');
  let groupName = groupNameInput.value.trim();
  
  // If no name provided, use a default name with numbering that starts at 1 for each RID
  if (!groupName) {
    // Count how many groups already exist for the current RID
    const ridGroupCount = customGroups.filter(g => g.rid === currentRID).length;
    // Use that count + 1 for the new group number
    groupName = `Group ${ridGroupCount + 1}`;
  }

  // Create a unique ID for the group (timestamp)
  const groupId = Date.now();
  
  // Select a color from the palette - use the count of groups for this specific RID
  const ridGroups = customGroups.filter(g => g.rid === currentRID);
  const colorIndex = ridGroups.length % colorPalette.length;
  const color = colorPalette[colorIndex];
  
  // Create points array with deep copies of the selected points
  const points = selectedDataPoints.map(index => {
    // Make sure the index is valid
    if (index >= 0 && index < filteredData.length) {
      return { ...filteredData[index] };
    }
    return null; // For invalid indexes
  }).filter(Boolean); // Remove any null entries
  
  // Safety check - make sure we have valid points
  if (points.length === 0) {
    showMessage('Error: Failed to create group with selected points', 'error');
    return;
  }
  
  // Sort points by station to ensure consistent display
  points.sort((a, b) => a.station - b.station);

  // Create the group object
  const newGroup = {
    id: groupId,
    name: groupName,
    color: color,
    points: points,
    visible: true,
    rid: currentRID
  };

  // Add to custom groups array
  customGroups.push(newGroup);

  // Automatically select the new group for percentage change calculation
  selectedGroups.push(groupId);

  // Update the visualization
  updatePlot(filteredData);
  
  // Update the group list in the UI
  updateGroupList();
  
  // Update map with new group colors
  if (typeof updateMapWithAllData === 'function' && mapInitialized) {
    updateMapWithAllData(filteredData);
  }
  
  // Clear the input field
  groupNameInput.value = '';
  
  // Display success message
  showMessage(`Created group "${groupName}" with ${points.length} points`, 'success');
  
  // Also clear the selection
  selectedDataPoints = [];
  
  // Update selection info
  displaySelectionInfo();
}

/************************************************************
 * Update Group List
 ************************************************************/
function updateGroupList() {
  const groupListDiv = document.getElementById('group-list');
  groupListDiv.innerHTML = '';

  if (customGroups.length === 0 || 
      !customGroups.some(g => g.rid === currentRID)) {
    // No groups for the current RID
    groupListDiv.innerHTML = `
      <div class="hint-text">
        <i class="fa fa-info-circle"></i> No groups created yet for the current route (${currentRID}). 
        Select points on the chart and use "Create Group" to organize your data.
      </div>
    `;
    return;
  }

  // Filter groups by current RID for display purposes only
  const currentGroups = customGroups.filter(g => g.rid === currentRID);
  
  // Show count of groups for current RID
  const groupCountMessage = document.createElement('div');
  groupCountMessage.className = 'hint-text mb-2';
  groupCountMessage.innerHTML = `
    <i class="fa fa-layer-group"></i> Showing ${currentGroups.length} group(s) for route: <strong>${currentRID}</strong>
  `;
  groupListDiv.appendChild(groupCountMessage);

  // Create a message about group selection for percentage change calculation
  const selectionHint = document.createElement('div');
  selectionHint.className = 'hint-text mb-2';
  selectionHint.innerHTML = `
    <i class="fa fa-chart-line"></i> Select groups to view their percentage change calculations on the chart.
    If no groups are selected, the percentage change for all data will be shown.
  `;
  groupListDiv.appendChild(selectionHint);
  
  // Clear All Selections button
  if (selectedGroups.length > 0) {
    const clearSelectionBtn = document.createElement('button');
    clearSelectionBtn.className = 'btn mb-2';
    clearSelectionBtn.innerHTML = '<i class="fa fa-times-circle"></i> Clear All Selections';
    clearSelectionBtn.onclick = () => {
      selectedGroups = [];
      updateGroupList();
      updatePlot(filteredData);
      showMessage('Cleared all group selections', 'info');
    };
    groupListDiv.appendChild(clearSelectionBtn);
  }

  // Create group items
  currentGroups.forEach(group => {
    const groupItem = document.createElement('div');
    groupItem.className = 'group-item';
    groupItem.style.borderLeftColor = group.color;
    
    // Create a header container to hold the name and actions 
    const headerContainer = document.createElement('div');
    headerContainer.className = 'group-item-header';
    
    // Group header with color indicator and name
    const groupHeader = document.createElement('h4');
    
    const colorIndicator = document.createElement('span');
    colorIndicator.className = 'group-color';
    colorIndicator.style.backgroundColor = group.color;
    
    const groupName = document.createElement('span');
    groupName.textContent = `${group.name} (${group.points.length} points)`;
    
    groupHeader.appendChild(colorIndicator);
    groupHeader.appendChild(groupName);
    
    // Group actions container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'group-item-actions';
    
    // Visibility toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.innerHTML = group.visible ? 
      '<i class="fa fa-eye" title="Hide group"></i>' : 
      '<i class="fa fa-eye-slash" title="Show group"></i>';
    toggleBtn.title = group.visible ? 'Hide group' : 'Show group';
    toggleBtn.onclick = () => {
      group.visible = !group.visible;
      
      // If the group is now hidden, also remove it from selected groups if it was selected
      if (!group.visible) {
        const selIndex = selectedGroups.indexOf(group.id);
        if (selIndex !== -1) {
          selectedGroups.splice(selIndex, 1);
        }
      }
      
      updateGroupList();
      updatePlot(filteredData);
      showMessage(`Group "${group.name}" ${group.visible ? 'visible' : 'hidden'}`, 'info');
    };
    
    // Select for percentage calculation button
    const selectForCalcBtn = document.createElement('button');
    const isSelected = selectedGroups.includes(group.id);
    selectForCalcBtn.innerHTML = isSelected ?
      '<i class="fa fa-chart-bar" style="color: #4caf50;" title="Unselect for percentage calculation"></i>' :
      '<i class="fa fa-chart-bar" title="Select for percentage calculation"></i>';
    selectForCalcBtn.title = isSelected ? 'Unselect for percentage calculation' : 'Select for percentage calculation';
    
    // Only enable for visible groups with enough data points
    const hasEnoughPoints = group.points.length >= 2;
    if (!hasEnoughPoints || !group.visible) {
      selectForCalcBtn.disabled = true;
      selectForCalcBtn.title = !hasEnoughPoints ? 
        'Group needs at least 2 points for calculation' : 
        'Group must be visible to calculate percentage changes';
    }
    
    selectForCalcBtn.onclick = () => {
      if (isSelected) {
        // Remove from selected groups
        const index = selectedGroups.indexOf(group.id);
        if (index !== -1) {
          selectedGroups.splice(index, 1);
        }
        showMessage(`Group "${group.name}" removed from percentage calculation`, 'info');
      } else {
        // Add to selected groups
        selectedGroups.push(group.id);
        showMessage(`Group "${group.name}" added to percentage calculation`, 'info');
      }
      updateGroupList();
      updatePlot(filteredData);
    };
    
    // Edit name button
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '<i class="fa fa-edit" title="Rename group"></i>';
    editBtn.title = 'Rename group';
    editBtn.onclick = () => {
      const newName = prompt('Enter new name for group:', group.name);
      if (newName && newName.trim()) {
        group.name = newName.trim();
        updateGroupList();
        updatePlot(filteredData);
        showMessage(`Group renamed to "${group.name}"`, 'success');
      }
    };
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<i class="fa fa-trash" title="Delete group"></i>';
    deleteBtn.title = 'Delete group';
    deleteBtn.onclick = () => {
      if (confirm(`Are you sure you want to delete the group "${group.name}"?`)) {
        const index = customGroups.findIndex(g => g.id === group.id);
        if (index !== -1) {
          // Also remove from selected groups if it was selected
          const selIndex = selectedGroups.indexOf(group.id);
          if (selIndex !== -1) {
            selectedGroups.splice(selIndex, 1);
          }
          
          customGroups.splice(index, 1);
          updateGroupList();
          updatePlot(filteredData);
          showMessage(`Group "${group.name}" deleted`, 'info');
        }
      }
    };
    
    // Add all buttons to the actions div
    actionsDiv.appendChild(toggleBtn);
    actionsDiv.appendChild(selectForCalcBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    
    // Add elements to header container
    headerContainer.appendChild(groupHeader);
    headerContainer.appendChild(actionsDiv);
    
    // Add header container to group item
    groupItem.appendChild(headerContainer);
    
    // Add group item to the list
    groupListDiv.appendChild(groupItem);
    
    // Add stats for selected groups
    if (isSelected && group.visible && group.points.length >= 2) {
      // Calculate percentage changes for this group
      const groupPercentageChanges = calculatePercentageChange(group.points, group);
      
      // Calculate average percentage change if there are values
      if (groupPercentageChanges.length > 0) {
        const avgChange = groupPercentageChanges.reduce((sum, pc) => sum + pc.percentChange, 0) / groupPercentageChanges.length;
        
        const groupStats = document.createElement('div');
        groupStats.className = 'group-stats';
        groupStats.innerHTML = `
          <div class="stat-item">
            <div class="stat-value">${avgChange.toFixed(2)}%</div>
            <div class="stat-label">Avg Change/100ft</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${groupPercentageChanges.length}</div>
            <div class="stat-label">Data Points</div>
          </div>
        `;
        
        groupItem.appendChild(groupStats);
      }
    }
  });
}

/************************************************************
 * Leaflet Map Functions
 ************************************************************/
function initMap() {
  try {
    if (typeof L === 'undefined') {
      console.error("Leaflet library not loaded");
      return;
    }

    // Check if map was previously initialized
    if (mapInitialized && mapInstance) {
      console.log("Map already initialized");
      return;
    }

    console.log("Starting map initialization...");

    // Get map container element
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      console.warn("Map container element not found.");
      return;
    }

    // Create map instance
    mapInstance = L.map('map', {
      center: [45.0, -93.0],  // Default center (adjust as needed)
      zoom: 6,               // Default zoom level
      maxZoom: 18,
      minZoom: 2
    });

    // Define base tile layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });
    
    // Google Satellite layer
    const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20
    });
    
    // Define basemap options - simplified to just the two requested options
    const baseMaps = {
      "Standard Map": osmLayer,
      "Google Satellite": googleSat
    };
    
    // Add the OpenStreetMap layer to the map by default
    osmLayer.addTo(mapInstance);
    
    // Add layer control to the map
    L.control.layers(baseMaps, null, {
      collapsed: false,
      position: 'topright'
    }).addTo(mapInstance);

    // Add scale control
    L.control.scale().addTo(mapInstance);

    // Add a legend to explain the different marker types
    const legend = L.control({ position: 'bottomright' });
    
    legend.onAdd = function(map) {
      const div = L.DomUtil.create('div', 'map-legend');
      
      div.innerHTML = `
        <div><span class="circle-icon"></span> Standard Point</div>
        <div><span class="square-icon"></span> Point Generic</div>
        <div><span class="triangle-icon"></span> Setup Location</div>
      `;
      
      return div;
    };
    
    legend.addTo(mapInstance);

    // Set flag indicating the map is initialized
    mapInitialized = true;
    mapMarkers = []; // Initialize empty markers array
    console.log("Map initialized successfully");

    // If we already have filtered data, update the map
    if (filteredData && filteredData.length > 0) {
      console.log("Updating map with existing filtered data...");
      setTimeout(() => {
        updateMapWithAllData(filteredData);
      }, 500); // Small delay to ensure map is fully rendered
    }

  } catch (error) {
    console.error("Error initializing map:", error);
    mapInitialized = false;
  }
}

function updateMapWithAllData(dataSet) {
  // Check if mapInstance exists and is initialized
  if (!mapInitialized || !mapInstance) {
    console.warn("Map not properly initialized. Map update skipped.");
    // Try to initialize map if Leaflet is available but map isn't initialized yet
    if (typeof L !== 'undefined' && !mapInitialized) {
      console.log("Attempting to initialize map now...");
      initMap();
      if (!mapInitialized) {
        console.warn("Could not initialize map. Update skipped.");
        return;
      }
    } else {
      return;
    }
  }
  
  try {
    console.log(`Updating map with ${dataSet ? dataSet.length : 0} data points...`);
    
    // Clear existing markers
    mapMarkers.forEach(marker => marker.remove());
    mapMarkers = [];

    if (!dataSet || dataSet.length === 0) {
      console.warn("No data provided to update map");
      return;
    }

    let validPointsCount = 0;

    dataSet.forEach(pt => {
      if (pt.latitude && pt.longitude && !isNaN(pt.latitude) && !isNaN(pt.longitude)) {
        // Check if this point belongs to any group for the current RID
        let markerColor = '#ffce56'; // Default color
        
        // Find if point belongs to any group
        if (customGroups && customGroups.length > 0) {
          for (const group of customGroups) {
            if (group.rid === currentRID && group.visible) {
              // Check if point is in this group by comparing station values
              const foundInGroup = group.points.some(groupPt => 
                groupPt.station === pt.station && 
                (groupPt.current === pt.current || (pt.isSpecialPoint && groupPt.isSpecialPoint)));
              
              if (foundInGroup) {
                markerColor = group.color;
                break; // Stop checking other groups once found
              }
            }
          }
        }
        
        let marker;
        
        // Check for special point types
        if (pt.pointType) {
          const pointType = pt.pointType.toUpperCase();
          
          if (pointType === 'POINT GENERIC') {
            // Create a square marker for POINT GENERIC
            const squareIcon = L.divIcon({
              className: 'custom-marker',
              html: `<div style="width: 14px; height: 14px; background-color: #ff6347; border: 2px solid black;"></div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9]
            });
            
            marker = L.marker([pt.latitude, pt.longitude], {
              icon: squareIcon
            });
            validPointsCount++;
          } 
          else if (pointType === 'SETUP LOCATION') {
            // Create a triangle marker for SETUP LOCATION
            const triangleIcon = L.divIcon({
              className: 'custom-marker',
              html: `<div style="width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 16px solid #32cd32; box-shadow: 0 0 0 2px black;"></div>`,
              iconSize: [18, 16],
              iconAnchor: [9, 16]
            });
            
            marker = L.marker([pt.latitude, pt.longitude], {
              icon: triangleIcon
            });
            validPointsCount++;
          }
          else {
            // Create standard circle marker for other points
            marker = L.circleMarker([pt.latitude, pt.longitude], {
              radius: 5,
              fillColor: markerColor,
              color: markerColor,
              weight: 1,
              opacity: 1,
              fillOpacity: 0.8
            });
            validPointsCount++;
          }
        }
        else {
          // Standard circle marker
          marker = L.circleMarker([pt.latitude, pt.longitude], {
            radius: 5,
            fillColor: markerColor,
            color: markerColor,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          });
          validPointsCount++;
        }

        // Create popup content based on point type
        let popupContent = `<strong>Station:</strong> ${pt.station}<br>`;
        
        // Add Signal information if available
        if (pt.signal !== null && pt.signal !== undefined) {
          popupContent += `<strong>Signal:</strong> ${pt.signal} mA<br>`;
        }
        
        // Add Current information if available
        if (pt.current !== null && pt.current !== undefined) {
          popupContent += `<strong>Current:</strong> ${pt.current.toFixed(2)} dBmA<br>`;
        }
        
        // Add Point Type information
        popupContent += `<strong>Point Type:</strong> ${pt.pointType || 'N/A'}`;
        
        marker.bindPopup(popupContent);
        marker.addTo(mapInstance);
        mapMarkers.push(marker);
      }
    });
    
    console.log(`Added ${validPointsCount} markers to map`);
    
    // Fit map to markers if we have any
    if (mapMarkers.length > 0) {
      try {
        const group = L.featureGroup(mapMarkers);
        mapInstance.fitBounds(group.getBounds());
      } catch (fitError) {
        console.warn("Could not fit map to bounds:", fitError);
      }
    }
  } catch (error) {
    console.error("Error updating map:", error);
  }
}

/************************************************************
 * Toggle Remove Mode
 ************************************************************/
function toggleRemoveMode() {
  isRemoveMode = !isRemoveMode;
  const removeBtn = document.getElementById('remove-points-btn');
  removeBtn.textContent = isRemoveMode ? 'Remove Mode (ON)' : 'Remove Points';
  showMessage(`Remove mode: ${isRemoveMode ? 'ON' : 'OFF'}`, 'info');
}

/************************************************************
 * Restore Removed Points
 ************************************************************/
function restoreRemovedPoints() {
  if (removedPoints.length === 0) {
    showMessage("No removed points to restore.", "info");
    return;
  }
  
  // Restore all removed points
  removedPoints.forEach(pt => (pt.removed = false));
  showMessage(`Restored ${removedPoints.length} data point(s).`, "success");
  removedPoints = [];
  
  // Sort the data by station before redisplaying
  const sortedData = [...filteredData];
  sortedData.sort((a, b) => a.station - b.station);
  
  // Update the plot with all points
  updatePlot(sortedData);
}

/************************************************************
 * Reset Plot Zoom
 ************************************************************/
function resetPlotZoom() {
  Plotly.relayout('plotly-chart', {
    'xaxis.autorange': true,
    'yaxis.autorange': true
  });
}

/************************************************************
 * Data Export
 ************************************************************/
function handleDownloadData(format) {
  // Create dialog to ask if user wants to export all RIDs or just current RID
  const exportAllRIDs = confirm("Do you want to export ALL RIDs?\n\n- Click 'OK' to export the complete dataset with all RIDs\n- Click 'Cancel' to export only the current RID");
  
  // Choose which dataset to export
  const dataToExport = exportAllRIDs ? parsedData : filteredData;
  
  if (dataToExport.length === 0) {
    showMessage('No data to export.', 'warning');
    return;
  }

  // Run test export function to debug
  console.log("Running test export before actual export");
  testExportData(dataToExport);

  switch (format) {
    case 'excel':
      exportToExcel(dataToExport);
      break;
    case 'csv':
      exportToCSV(dataToExport);
      break;
    case 'json':
      exportToJSON(dataToExport);
      break;
    default:
      showMessage('Unsupported export format.', 'error');
  }
  
  // Show confirmation message
  const ridInfo = exportAllRIDs 
    ? `ALL RIDs (${[...new Set(dataToExport.map(d => d.rid))].length} routes)` 
    : `current RID (${currentRID})`;
  showMessage(`Exported ${dataToExport.length} data points from ${ridInfo}`, 'success');
}

function exportToExcel(data) {
  if (data.length === 0) {
    showMessage('No data to export.', 'warning');
    return;
  }
  
  console.log("Starting Excel export with", data.length, "data points");
  console.log("Original columns:", originalColumns);
  
  // For debugging: check the first data point
  if (data.length > 0) {
    console.log("First data point for export:", data[0]);
    console.log("Field count:", Object.keys(data[0]).length);
    
    // Check if we have the _originalData property as a backup
    if (data[0]._originalData) {
      console.log("Original data is available");
      console.log("Original data fields:", Object.keys(data[0]._originalData));
      console.log("Original field count:", Object.keys(data[0]._originalData).length);
    }
  }
  
  // Detailed logging of which original columns will be exported
  if (originalColumns && originalColumns.length > 0) {
    const columnsStatus = originalColumns.map(col => {
      // Check if at least the first data point has this field
      const hasField = data.length > 0 && (
        data[0][col] !== undefined || 
        (data[0]._originalData && data[0]._originalData[col] !== undefined)
      );
      return { column: col, present: hasField };
    });
    
    console.log("Original columns export status:", columnsStatus);
    
    const missingColumns = columnsStatus.filter(c => !c.present).map(c => c.column);
    if (missingColumns.length > 0) {
      console.warn("WARNING: Some original columns may be missing in export:", missingColumns);
    }
  }
  
  // Build a worksheet with all data fields preserved
  const wsData = data.map(d => {
    // Start with an empty object for the export row
    const exportRow = {};
    
    // First, include all fields from the original Excel in their original order
    if (originalColumns && originalColumns.length > 0) {
      originalColumns.forEach(col => {
        // Check different ways the data might be stored
        if (d[col] !== undefined) {
          // Direct property match
          exportRow[col] = d[col];
        } else if (d._originalData && d._originalData[col] !== undefined) {
          // Check the backup original data
          exportRow[col] = d._originalData[col];
        } else {
          // Check for camelCase variations
          const camelCase = col.toLowerCase().replace(/(_)([a-z])/g, (m, p1, p2) => p2.toUpperCase());
          if (d[camelCase] !== undefined) {
            exportRow[col] = d[camelCase];
          } else {
            // Not found, use empty string
            exportRow[col] = '';
          }
        }
      });
    } else {
      // Fallback: if originalColumns is not available, include all properties
      // Start with any original data if available
      if (d._originalData) {
        Object.keys(d._originalData).forEach(key => {
          exportRow[key] = d._originalData[key];
        });
      }
      
      // Then add all other properties from the processed data
      Object.keys(d).forEach(key => {
        // Skip the _originalData property itself
        if (key !== '_originalData') {
          exportRow[key] = d[key];
        }
      });
    }
    
    // Ensure our calculated fields are always included
    // These might override some original fields, but that's OK
    exportRow['Station'] = d.station;
    exportRow['Signal(mA)'] = d.signal;
    exportRow['Current(dBmA)'] = d.current;
    exportRow['GroupID'] = d.group;
    exportRow['Removed'] = d.removed ? 'Yes' : 'No';
    
    // Calculate % Current Change/100ft if group is assigned
    if (d.group !== null) {
      // For calculating change, only use points within the same RID
      const groupPoints = data.filter(p => p.group === d.group && p.rid === d.rid);
      if (groupPoints.length >= 2) {
        // Sort by station to find adjacent points
        groupPoints.sort((a, b) => a.station - b.station);
        const pointIndex = groupPoints.findIndex(p => p.station === d.station);
        
        // If not the last point in group, calculate change to next point
        if (pointIndex < groupPoints.length - 1) {
          const nextPoint = groupPoints[pointIndex + 1];
          const stationDiff = nextPoint.station - d.station;
          const currentDiff = nextPoint.current - d.current;
          const changePerFt = currentDiff / stationDiff;
          const changePer100Ft = changePerFt * 100;
          exportRow['% Current Change/100ft'] = changePer100Ft.toFixed(4);
        } else {
          exportRow['% Current Change/100ft'] = '';
        }
      } else {
        exportRow['% Current Change/100ft'] = '';
      }
    } else {
      exportRow['% Current Change/100ft'] = '';
    }
    
    return exportRow;
  });
  
  // Debug: log the first export row
  if (wsData.length > 0) {
    console.log("First row in Excel export data:", wsData[0]);
    console.log("Excel export row field count:", Object.keys(wsData[0]).length);
    
    // Check if any original columns are missing in the export
    if (originalColumns && originalColumns.length > 0) {
      const firstExportRow = wsData[0];
      const missingInExport = originalColumns.filter(col => firstExportRow[col] === undefined);
      if (missingInExport.length > 0) {
        console.warn("WARNING: Original columns missing in Excel export:", missingInExport);
      } else {
        console.log("All original columns included in Excel export");
      }
    }
  }
  
  const wb = XLSX.utils.book_new();
  
  // Group the data by RID if multiple RIDs are present
  const uniqueRIDs = [...new Set(data.map(d => d.rid))];
  
  if (uniqueRIDs.length > 1) {
    // If multiple RIDs, create a separate sheet for each RID
    uniqueRIDs.forEach(rid => {
      const ridData = wsData.filter(d => d.rid === rid);
      if (ridData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(ridData);
        XLSX.utils.book_append_sheet(wb, ws, `RID_${rid.toString().replace(/[^a-zA-Z0-9]/g, '_')}`);
      }
    });
    
    // Also add a sheet with all data combined
    const wsAll = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, wsAll, 'All_Data');
  } else {
    // If single RID, just create one sheet
    const ws = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'PCM Data');
  }

  // Add a summary sheet
  const summaryData = [
    ['Total Points', data.length],
    ['Total RIDs', uniqueRIDs.length],
    ['RIDs', uniqueRIDs.join(', ')],
    ['Removed Points', data.filter(d => d.removed).length],
    ['Groups', [...new Set(data.filter(d => d.group !== null).map(d => d.group))].length]
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Create the Excel file
  XLSX.writeFile(wb, 'PCM_Data.xlsx');
  console.log("Excel export completed");
}

function exportToCSV(data) {
  if (data.length === 0) {
    showMessage('No data to export.', 'warning');
    return;
  }
  
  console.log("Starting CSV export with", data.length, "data points");
  
  // Define the calculated fields to add at the end
  const calculatedFields = [
    'Current(dBmA)', 
    'GroupID',
    'Removed',
    '% Current Change/100ft'
  ];
  
  // Final set of columns in order: original columns + calculated fields
  let csvColumns = [];
  
  // First use the original columns if we have them
  if (originalColumns && originalColumns.length > 0) {
    csvColumns = [...originalColumns];
  } else {
    // Fall back to collecting all possible keys from all data points
    const allKeys = new Set();
    
    // First add all keys from the original data
    if (window.originalExcelData && window.originalExcelData.length > 0) {
      window.originalExcelData.forEach(row => {
        Object.keys(row).forEach(key => {
          allKeys.add(key);
        });
      });
    }
    
    // Then add all keys from the processed data (except for _originalData)
    data.forEach(d => {
      Object.keys(d).forEach(key => {
        if (key !== '_originalData') {
          allKeys.add(key);
        }
      });
    });
    
    csvColumns = Array.from(allKeys);
  }
  
  // Add calculated fields at the end if they don't already exist
  calculatedFields.forEach(field => {
    if (!csvColumns.includes(field)) {
      csvColumns.push(field);
    }
  });
  
  console.log("CSV will include", csvColumns.length, "columns");
  
  // Create the CSV header
  let csvStr = csvColumns.join(',') + '\n';
  
  // Group data by RID for calculating current change correctly
  const ridGroups = {};
  data.forEach(d => {
    if (!ridGroups[d.rid]) {
      ridGroups[d.rid] = [];
    }
    ridGroups[d.rid].push(d);
  });
  
  // Process each data point
  for (const d of data) {
    // Create an export row object
    const exportRow = {};
    
    // Process each column in order
    csvColumns.forEach(col => {
      // Check different places the data might be stored
      if (d[col] !== undefined) {
        // Direct match in the processed data
        exportRow[col] = d[col];
      } else if (d._originalData && d._originalData[col] !== undefined) {
        // Check the original data backup
        exportRow[col] = d._originalData[col];
      } else {
        // Check for camelCase variations
        const camelCase = col.toLowerCase().replace(/(_)([a-z])/g, (m, p1, p2) => p2.toUpperCase());
        if (d[camelCase] !== undefined) {
          exportRow[col] = d[camelCase];
        } else {
          // Not found, use empty string
          exportRow[col] = '';
        }
      }
    });
    
    // Ensure our calculated fields are always included
    exportRow['Station'] = d.station;
    exportRow['Signal(mA)'] = d.signal;
    exportRow['Current(dBmA)'] = d.current;
    exportRow['GroupID'] = d.group;
    exportRow['Removed'] = d.removed ? 'Yes' : 'No';
    
    // Calculate % Current Change/100ft within the same RID
    if (d.group !== null) {
      const ridData = ridGroups[d.rid] || [];
      const groupPoints = ridData.filter(p => p.group === d.group);
      
      if (groupPoints.length >= 2) {
        groupPoints.sort((a, b) => a.station - b.station);
        const pointIndex = groupPoints.findIndex(p => p.station === d.station);
        
        if (pointIndex < groupPoints.length - 1) {
          const nextPoint = groupPoints[pointIndex + 1];
          const stationDiff = nextPoint.station - d.station;
          const currentDiff = nextPoint.current - d.current;
          const changePerFt = currentDiff / stationDiff;
          const changePer100Ft = changePerFt * 100;
          exportRow['% Current Change/100ft'] = changePer100Ft.toFixed(4);
        } else {
          exportRow['% Current Change/100ft'] = '';
        }
      } else {
        exportRow['% Current Change/100ft'] = '';
      }
    } else {
      exportRow['% Current Change/100ft'] = '';
    }
    
    // Build the CSV row by joining values in the correct order
    const row = csvColumns.map(key => {
      const value = exportRow[key] !== undefined ? exportRow[key] : '';
      
      // Wrap strings with commas in quotes
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      
      return value;
    }).join(',');
    
    csvStr += row + '\n';
  }

  // Check if we have multiple RIDs for filename
  const uniqueRIDs = [...new Set(data.map(d => d.rid))];
  const fileName = uniqueRIDs.length > 1 ? 'PCM_Data_All_RIDs.csv' : `PCM_Data_RID_${uniqueRIDs[0]}.csv`;

  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  console.log("CSV export completed");
}

function exportToJSON(data) {
  if (data.length === 0) {
    showMessage('No data to export.', 'warning');
    return;
  }
  
  console.log("Starting JSON export with", data.length, "data points");
  
  // Group data by RID for calculating current change correctly
  const ridGroups = {};
  data.forEach(d => {
    if (!ridGroups[d.rid]) {
      ridGroups[d.rid] = [];
    }
    ridGroups[d.rid].push(d);
  });
  
  // Create an export that preserves original field order
  const exportData = data.map(d => {
    // Create an object to store in order: original fields followed by calculated fields
    const exportObj = {};
    
    // First add all original fields in the original order
    if (originalColumns && originalColumns.length > 0) {
      originalColumns.forEach(col => {
        // Check if this field exists directly in the data point
        if (d[col] !== undefined) {
          exportObj[col] = d[col];
        } else if (d._originalData && d._originalData[col] !== undefined) {
          // Check the original data backup
          exportObj[col] = d._originalData[col];
        } else {
          // Field name might be camelCase in our data structure
          const camelCase = col.toLowerCase().replace(/(_)([a-z])/g, (m, p1, p2) => p2.toUpperCase());
          if (d[camelCase] !== undefined) {
            exportObj[camelCase] = d[camelCase];
          } else {
            // If we don't have this field, add null for JSON
            exportObj[col] = null;
          }
        }
      });
    } else {
      // Start with original data if available
      if (d._originalData) {
        Object.keys(d._originalData).forEach(key => {
          exportObj[key] = d._originalData[key];
        });
      }
      
      // Then add all other properties from the processed data
      Object.keys(d).forEach(key => {
        if (key !== '_originalData') {
          exportObj[key] = d[key];
        }
      });
    }
    
    // Add calculated fields
    exportObj.formattedStation = formatStation(d.station);
    exportObj.current_dBmA = d.current;
    exportObj.groupID = d.group;
    exportObj.removed = d.removed;
    
    // Calculate % Current Change/100ft if group is assigned - within the same RID
    if (d.group !== null) {
      const ridData = ridGroups[d.rid] || [];
      const groupPoints = ridData.filter(p => p.group === d.group);
      
      if (groupPoints.length >= 2) {
        // Sort by station to find adjacent points
        groupPoints.sort((a, b) => a.station - b.station);
        const pointIndex = groupPoints.findIndex(p => p.station === d.station);
        
        // If not the last point in group, calculate change to next point
        if (pointIndex < groupPoints.length - 1) {
          const nextPoint = groupPoints[pointIndex + 1];
          const stationDiff = nextPoint.station - d.station;
          const currentDiff = nextPoint.current - d.current;
          const changePerFt = currentDiff / stationDiff;
          const changePer100Ft = changePerFt * 100;
          exportObj.currentChangePer100Ft = parseFloat(changePer100Ft.toFixed(4));
        } else {
          exportObj.currentChangePer100Ft = null;
        }
      } else {
        exportObj.currentChangePer100Ft = null;
      }
    } else {
      exportObj.currentChangePer100Ft = null;
    }
    
    return exportObj;
  });
  
  // Check if we have multiple RIDs
  const uniqueRIDs = [...new Set(data.map(d => d.rid))];
  const fileName = uniqueRIDs.length > 1 ? 'PCM_Data_All_RIDs.json' : `PCM_Data_RID_${uniqueRIDs[0]}.json`;
  
  // For JSON, we might also want to create a more structured output for multiple RIDs
  let jsonOutput;
  if (uniqueRIDs.length > 1) {
    // Create a structured JSON with data grouped by RID
    jsonOutput = {
      summary: {
        totalPoints: data.length,
        rids: uniqueRIDs,
        groups: [...new Set(data.filter(d => d.group !== null).map(d => d.group))]
      },
      // Group data by RID
      ridData: Object.fromEntries(
        Object.entries(ridGroups).map(([rid, points]) => [rid, points.map(p => {
          const dataPoint = exportData.find(d => d.station === p.station && d.rid === p.rid);
          return dataPoint || p;
        })])
      ),
      // Also include the flat data array
      allData: exportData
    };
  } else {
    // Single RID - just use the flat array
    jsonOutput = exportData;
  }
  
  // Debug output
  console.log("JSON export structure created with", exportData.length, "data points");
  if (exportData.length > 0) {
    console.log("Field count in first exported item:", Object.keys(exportData[0]).length);
  }
  
  const jsonStr = JSON.stringify(jsonOutput, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  console.log("JSON export completed");
}

/************************************************************
 * Utility / Helper Functions
 ************************************************************/
function showMessage(message, type = 'info') {
  // Create the message container
  const messageArea = document.getElementById('message-area');
  
  // Create the message element
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  
  // Add appropriate icon based on message type
  let icon = '';
  switch (type) {
    case 'success':
      icon = '<i class="fa fa-check-circle"></i>';
      break;
    case 'error':
      icon = '<i class="fa fa-times-circle"></i>';
      break;
    case 'warning':
      icon = '<i class="fa fa-exclamation-triangle"></i>';
      break;
    default:
      icon = '<i class="fa fa-info-circle"></i>';
  }
  
  // Add content to message
  messageElement.innerHTML = `
    ${icon} 
    <span>${message}</span>
    <button class="close-message" onclick="this.parentElement.remove()">
      <i class="fa fa-times"></i>
    </button>
  `;
  
  // Add to message area
  messageArea.appendChild(messageElement);
  
  // Set auto-dismiss timer (except for errors)
  if (type !== 'error') {
    const dismissTime = type === 'warning' ? 6000 : 4000;
    setTimeout(() => {
      if (messageElement.parentElement) {
        messageElement.classList.add('fade-out');
        setTimeout(() => {
          if (messageElement.parentElement) {
            messageElement.remove();
          }
        }, 300);
      }
    }, dismissTime);
  }
}

function openHelpModal() {
  document.getElementById('help-modal').style.display = 'block';
}

function closeHelpModal() {
  document.getElementById('help-modal').style.display = 'none';
}

function openAboutModal() {
  document.getElementById('about-modal').style.display = 'block';
}

function closeAboutModal() {
  document.getElementById('about-modal').style.display = 'none';
}

/************************************************************
 * Utility Functions
 ************************************************************/

/**
 * Formats a station number in the "00+00" format
 * @param {number} station - The station value to format
 * @returns {string} Formatted station string
 */
function formatStation(station) {
  if (station == null || isNaN(station)) return '';
  
  // Split the station into whole and decimal parts
  const wholePart = Math.floor(station / 100);
  const decimalPart = Math.round(station % 100);
  
  // Format as 00+00
  return `${wholePart}+${decimalPart.toString().padStart(2, '0')}`;
}

/**
 * Calculates percentage change between consecutive points
 * @param {Array} data - Array of data points
 * @param {Object} group - Optional group object for group-specific calculations
 * @returns {Array} Array of percentage change objects
 */
function calculatePercentageChange(data, group = null) {
  if (!data || data.length < 2) {
    return []; // Return empty array if there's not enough data
  }
  
  // Filter out any special points that might cause calculation issues
  const validData = data.filter(point => !point.isSpecialPoint);
  
  if (validData.length < 2) {
    return []; // Return empty array if there's not enough valid data after filtering
  }
  
  // Sort data by station
  const sortedData = [...validData].sort((a, b) => a.station - b.station);
  
  // Determine which parameter to use (prefer current if available)
  const displayParameter = sortedData.some(point => point.current !== undefined) 
      ? 'current' : 'signal';
  
  // Calculate changes between points
  const percentageChanges = [];
  
  if (group) {
    // For a group, calculate one value using first and last point
    const firstPoint = sortedData[0];
    const lastPoint = sortedData[sortedData.length - 1];
    
    // Skip if values are null or undefined
    if (firstPoint && lastPoint && 
        firstPoint[displayParameter] != null && lastPoint[displayParameter] != null) {
      
      const referenceValue = firstPoint[displayParameter]; // First point is reference
      const currentValue = lastPoint[displayParameter];    // Last point is current
      const distance = lastPoint.station - firstPoint.station;
      
      // Skip if distance is too small or reference value is near zero
      if (distance >= 0.1 && Math.abs(referenceValue) >= 0.0001) {
        try {
          // Calculate percentage change per 100 feet using the formula:
          // 1. Calculate the percentage change: ((reference_value - current_value) / reference_value) * 100
          // 2. Scale to per-100-feet basis: % Change * (100 / distance)
          const percentChange = Math.abs((referenceValue - currentValue) / referenceValue) * 100 * (100 / distance);
          
          // Cap extreme values for display
          const cappedPercentChange = percentChange > 10 ? 10 : percentChange;
          
          // Apply the same percentage change to all points in the group
          for (let i = 1; i < sortedData.length; i++) {
            const point = sortedData[i];
            percentageChanges.push({
              station: point.station,
              percentChange: cappedPercentChange,
              actualPercentChange: percentChange,
              groupId: group.id,
              groupName: group.name,
              referenceStation: firstPoint.station,
              distance: distance
            });
          }
        } catch (error) {
          console.warn("Error calculating percentage change for group:", error);
        }
      }
    }
  } else {
    // If no group, calculate change between consecutive points
    for (let i = 0; i < sortedData.length - 1; i++) {
      const currentPoint = sortedData[i];
      const nextPoint = sortedData[i+1];
      
      // Skip points with missing data
      if (!currentPoint || !nextPoint) continue;
      
      // Get values
      const referenceValue = currentPoint[displayParameter]; // This is the reference value (earlier point)
      const currentValue = nextPoint[displayParameter];     // This is the current value (later point)
      
      // Skip if values are null or undefined
      if (referenceValue == null || currentValue == null) continue;
      
      // Calculate distance between points
      const distance = nextPoint.station - currentPoint.station;
      
      // Skip if distance is too small or current value is near zero
      if (distance < 0.1 || Math.abs(referenceValue) < 0.0001) continue;
      
      try {
        // Calculate percentage change per 100 feet using the formula:
        // 1. Calculate the percentage change: ((reference_value - current_value) / reference_value) * 100
        // 2. Scale to per-100-feet basis: % Change * (100 / distance)
        const percentChange = Math.abs((referenceValue - currentValue) / referenceValue) * 100 * (100 / distance);
        
        // Cap extreme values for display
        const cappedPercentChange = percentChange > 10 ? 10 : percentChange;
        
        // Store the result
        percentageChanges.push({
            station: nextPoint.station,
            percentChange: cappedPercentChange,
            actualPercentChange: percentChange,
            groupId: null,
            groupName: null,
            referenceStation: currentPoint.station,
            distance: distance
        });
      } catch (error) {
        console.warn("Error calculating percentage change:", error);
      }
    }
  }
  
  return percentageChanges;
}

// Add this new function after the handleDownloadData function
function testExportData(data) {
  console.log("=== TEST EXPORT DATA ===");
  console.log("Total data points:", data.length);
  
  if (data.length === 0) {
    console.log("No data to export");
    return;
  }
  
  // Check first data point details
  const firstPoint = data[0];
  console.log("First data point:", firstPoint);
  
  // Check if original data is preserved
  if (firstPoint._originalData) {
    console.log("Original data is preserved:", firstPoint._originalData);
    console.log("Original field count:", Object.keys(firstPoint._originalData).length);
  } else {
    console.log("WARNING: No _originalData property found");
  }
  
  // Compare original columns with what's in the data
  if (originalColumns && originalColumns.length > 0) {
    console.log("Original columns:", originalColumns);
    
    // Check which original columns exist in the data point
    const missingColumns = originalColumns.filter(col => 
      firstPoint[col] === undefined && 
      (!firstPoint._originalData || firstPoint._originalData[col] === undefined)
    );
    
    if (missingColumns.length > 0) {
      console.log("WARNING: Missing original columns:", missingColumns);
    } else {
      console.log("All original columns are preserved");
    }
  }
  
  // Test what would go into Excel export
  const excelRow = {};
  
  // Add all original columns
  if (originalColumns && originalColumns.length > 0) {
    originalColumns.forEach(col => {
      if (firstPoint[col] !== undefined) {
        excelRow[col] = firstPoint[col];
      } else if (firstPoint._originalData && firstPoint._originalData[col] !== undefined) {
        excelRow[col] = firstPoint._originalData[col];
      } else {
        const camelCase = col.toLowerCase().replace(/(_)([a-z])/g, (m, p1, p2) => p2.toUpperCase());
        if (firstPoint[camelCase] !== undefined) {
          excelRow[col] = firstPoint[camelCase];
        } else {
          excelRow[col] = '';
        }
      }
    });
  }
  
  console.log("Test Excel row:", excelRow);
  console.log("Excel row field count:", Object.keys(excelRow).length);
  
  if (originalColumns && originalColumns.length > 0) {
    // Check if we're missing any original columns in the export
    const missingInExport = originalColumns.filter(col => excelRow[col] === undefined);
    if (missingInExport.length > 0) {
      console.log("WARNING: Missing columns in export:", missingInExport);
    } else {
      console.log("All original columns included in export");
    }
  }
  
  console.log("=== END TEST EXPORT ===");
}

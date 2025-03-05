/**
 * PCM Data Grouping Tool
 * Main application logic for handling file uploads, data processing, 
 * visualization, and interactive data selection.
 */

// Register Chart.js plugins when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // The zoom plugin should be automatically registered when loaded from CDN
    console.log('Chart.js plugins loaded');
});

// Global variables
let parsedData = [];
let filteredData = []; // For storing data filtered by RID
let chart = null;
let map = null;
let mapMarkers = [];
let selectedDataPoints = [];
let dataParameters = {
    current: [],
    potential: [],
    anomalies: []
};
let activeParameter = 'signal'; // Default parameter to display (changed from 'value' to 'signal')
let isSelecting = false;
let dragStart = null;
let selectedArea = null;
let isUpdating = false; // Flag to prevent recursive updates
let customGroups = []; // Array to store custom groups (now RID-specific)
let currentRID = null; // Track the currently selected RID
let groupColors = [
    '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', 
    '#FF9F40', '#8AC54B', '#F2545B', '#E83E8C', '#DC3545', '#FD7E14'
]; // Colors for custom groups - removed blue (#36A2EB) and replaced with more distinct colors
let removedPoints = []; // Array to store points removed from the chart
let isRKeyPressed = false; // Flag to track if R key is pressed
let animationFrameId = null; // To store the animation frame ID

// Define and register the barSpan plugin for Chart.js
const barSpanPlugin = {
    id: 'barSpan',
    // Store the active hover bar for tooltip display
    _hoverBar: null,
    
    beforeDatasetsDraw: function(chart) {
        const ctx = chart.ctx;
        const datasets = chart.data.datasets || [];
        
        console.log(`barSpanPlugin processing ${datasets.length} datasets`);
        let barsDrawn = 0;
        let transitionBarsDrawn = 0;
        
        // Store bar information for hover detection
        this._bars = [];
        
        // Draw percentage change bars (continuous bars)
        datasets.forEach((dataset, i) => {
            // Skip if not a continuous bar dataset or hidden
            if (!dataset.continuousBar) return;
            
            // Skip if dataset is hidden
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden) {
                console.log(`Dataset ${i} (${dataset.label}) is hidden, skipping`);
                return;
            }
            
            const xScale = chart.scales.x;
            const yScale = chart.scales[dataset.yAxisID] || chart.scales.y;
            
            // Get the bar dimensions for X axis (horizontal span)
            const startX = xScale.getPixelForValue(dataset.startX);
            const endX = xScale.getPixelForValue(dataset.endX);
            const barWidth = endX - startX;

            // Always get the bottom of the chart (y=0) for the baseline
            const bottomY = yScale.getPixelForValue(0);
            
            // Calculate the height dynamically based on the percentage value
            const barValue = dataset.barValue;
            const topY = yScale.getPixelForValue(barValue);
            
            // Calculate height - ensure it's positive for upward bars
            let rectH = bottomY - topY;
            
            // Initialize rectY with the correct position based on the value
            let rectY = topY;
            
            // Ensure the bar is visible within the chart area
            if (startX > endX) {
                // Swap if start is after end
                const temp = startX;
                startX = endX;
                endX = temp;
            }
            
            // Ensure the width is at least 1 pixel
            if (barWidth < 1) {
                const midPoint = (startX + endX) / 2;
                startX = midPoint - 1;
                endX = midPoint + 1;
                barWidth = 2;
            }
            
            if (barWidth > 0) {
                console.log(`Drawing ${dataset.isTransition ? 'transition' : 'regular'} bar: ${dataset.label}, startX=${startX}, endX=${endX}, width=${barWidth}, height=${rectH}, value=${dataset.barValue}`);
                
                // Store bar information for hover detection
                this._bars.push({
                    startX: startX,
                    endX: endX,
                    topY: rectY,
                    bottomY: rectY + rectH,
                    dataset: dataset,
                    barValue: barValue,
                    startStation: dataset.startX,
                    endStation: dataset.endX
                });
                
                // Draw as a filled rectangle 
                ctx.save();
                
                // Fill with dataset color
                ctx.fillStyle = dataset.backgroundColor;
                
                // For transition bars, use a pattern to make them more visible
                if (dataset.isTransition) {
                    // Use a slightly lighter fill for transition bars
                    const color = dataset.backgroundColor;
                    // Make the fill slightly lighter for transition bars
                    if (color.includes('rgba')) {
                        // If it's an rgba color, adjust the opacity
                        const parts = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                        if (parts) {
                            const r = parseInt(parts[1]);
                            const g = parseInt(parts[2]);
                            const b = parseInt(parts[3]);
                            const a = parseFloat(parts[4]);
                            // Use a slightly higher opacity
                            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a * 0.8})`;
                        } else {
                            ctx.fillStyle = color;
                        }
                    } else {
                        ctx.fillStyle = color;
                    }
                    ctx.fillRect(startX, rectY, barWidth, rectH);
                } else {
                    // Regular fill for normal bars
                    ctx.fillRect(startX, rectY, barWidth, rectH);
                }
                
                // Add a border
                ctx.strokeStyle = dataset.borderColor || dataset.backgroundColor;
                ctx.lineWidth = dataset.borderWidth || 1;
                
                // Use dashed lines for transition bars
                if (dataset.isTransition) {
                    ctx.setLineDash([5, 5]);
                    transitionBarsDrawn++;
                } else {
                    ctx.setLineDash([]);
                    barsDrawn++;
                }
                
                ctx.strokeRect(startX, rectY, barWidth, rectH);
                
                // Add label if enough space
                if (barWidth > 40) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 10px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    let labelText;
                    if (dataset.isTransition) {
                        // For transition bars, show the percentage change
                        labelText = `${(dataset.barValue * 100).toFixed(3)}%`;
                    } else {
                        // For regular group bars, show the group name and percentage
                        const groupName = dataset.label.replace(' % Change', '');
                        labelText = `${groupName}: ${(dataset.barValue * 100).toFixed(3)}%`;
                    }
                    
                    const labelY = rectY + (rectH / 2);
                    ctx.fillText(labelText, startX + (barWidth / 2), labelY);
                }
                
                ctx.restore();
            } else {
                console.warn(`Skipping bar with invalid width: ${dataset.label}, startX=${startX}, endX=${endX}, width=${barWidth}`);
            }
        });
        
        console.log(`barSpanPlugin drew ${barsDrawn} regular bars and ${transitionBarsDrawn} transition bars`);
    },
    
    // Add hover detection for bars
    afterDatasetsDraw: function(chart, args, options) {
        // If we have an active hover bar, draw the tooltip
        if (this._hoverBar) {
            const ctx = chart.ctx;
            const bar = this._hoverBar;
            
            // Draw tooltip
            const tooltipWidth = 200;
            const tooltipHeight = 80;
            const tooltipX = Math.min(
                Math.max(bar.startX + (bar.endX - bar.startX) / 2 - tooltipWidth / 2, 10),
                chart.width - tooltipWidth - 10
            );
            const tooltipY = bar.topY - tooltipHeight - 10;
            
            // Draw tooltip background
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 5);
            ctx.fill();
            ctx.stroke();
            
            // Draw tooltip content
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Title
            ctx.fillText(bar.dataset.label, tooltipX + 10, tooltipY + 10);
            
            // Station range
            ctx.font = '11px Arial';
            ctx.fillText(`Station: ${formatStation(bar.startStation)} to ${formatStation(bar.endStation)}`, 
                tooltipX + 10, tooltipY + 30);
            
            // Percentage value
            ctx.fillText(`Percentage Change: ${(bar.barValue * 100).toFixed(3)}%`, 
                tooltipX + 10, tooltipY + 50);
            
            ctx.restore();
        }
    },
    
    // Handle mouse movement for hover detection
    beforeEvent: function(chart, args) {
        const event = args.event;
        
        // Only process hover events
        if (event.type === 'mousemove') {
            const mouseX = event.x;
            const mouseY = event.y;
            
            // Check if mouse is over any bar
            let hoveredBar = null;
            for (const bar of this._bars || []) {
                if (mouseX >= bar.startX && mouseX <= bar.endX && 
                    mouseY >= bar.topY && mouseY <= bar.bottomY) {
                    hoveredBar = bar;
                    break;
                }
            }
            
            // Update hover state
            if (hoveredBar !== this._hoverBar) {
                this._hoverBar = hoveredBar;
                chart.render(); // Trigger a redraw to show/hide tooltip
            }
        } else if (event.type === 'mouseleave') {
            // Clear hover state when mouse leaves chart
            if (this._hoverBar) {
                this._hoverBar = null;
                chart.render();
            }
        }
    }
};

// Register the plugin immediately if Chart.js is loaded
if (typeof Chart !== 'undefined') {
    Chart.register(barSpanPlugin);
}

// DOM elements
let messageArea = null;
let fileInput = null;
let fileStatus = null;
let dragDropArea = null;
let parameterSelect = null;
let processButton = null;
let downloadButton = null;
let clearSelectionButton = null;
let exportFormatSelect = null;
let chartCanvas = null;
let dataMapContainer = null;
let groupNameInput = null;
let applyGroupBtn = null;
let groupTogglesContainer = null;
let outputData = null;
let ridSelect = null;
let dataSelectionContainer = null;
let restorePointsBtn = null;
let fitScreenBtn = null;
let isLeftAxisHovered = false;  // Track if left Y-axis is being hovered
let isRightAxisHovered = false; // Track if right Y-axis is being hovered
let isXAxisHovered = false;     // Track if X-axis is being hovered
let zoomStates = {};  // Store zoom states for different RIDs

/**
 * Initializes the map for geographic visualization
 */
function initializeMap() {
    // Initialize the map if the map container exists
    const mapContainer = document.getElementById('data-map');
    if (mapContainer) {
        // Create a map centered at a default location
        map = L.map('data-map').setView([40, -95], 4);
        
        // Define base layers
        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        });
        
        const aerialLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19
        });
        
        // Define a baseMaps object to hold our base layers
        const baseMaps = {
            "Aerial View": aerialLayer,
            "Street Map": streetLayer
        };
        
        // Add aerial layer to the map by default
        aerialLayer.addTo(map);
        
        // Add layer controls to the map
        L.control.layers(baseMaps, null, {
            position: 'topright'
        }).addTo(map);
        
        // Add legend
        const legend = L.control({position: 'bottomright'});
        
        legend.onAdd = function() {
            const div = L.DomUtil.create('div', 'map-legend');
            div.innerHTML = `
                <h4>Map Legend</h4>
                <div>
                    <div style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background-color: #2196F3; border: 1px solid #000; margin-right: 8px;"></div>
                    SIGNAL Points
                </div>
                <div>
                    <div style="display: inline-block; width: 14px; height: 14px; background-color: #FFA500; transform: rotate(45deg); border: 1px solid #000; margin-right: 8px;"></div>
                    Point Generic
                </div>
                <div>
                    <div style="display: inline-block; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 14px solid #4CAF50; margin-right: 8px;"></div>
                    Setup Location
                </div>
            `;
            return div;
        };
        
        legend.addTo(map);
        
        // Add a message for when no geographic data is available
        const noGeoDataMessage = document.createElement('div');
        noGeoDataMessage.className = 'no-geo-data-message';
        noGeoDataMessage.innerHTML = '<p>No geographic data available in the current dataset</p>';
        mapContainer.appendChild(noGeoDataMessage);
        noGeoDataMessage.style.display = 'flex';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    messageArea = document.getElementById('message-area');
    fileInput = document.getElementById('file-input');
    fileStatus = document.getElementById('file-status');
    dragDropArea = document.getElementById('drag-drop-area');
    processButton = document.getElementById('process-btn');
    downloadButton = document.getElementById('download-btn');
    chartCanvas = document.getElementById('data-chart');
    dataMapContainer = document.getElementById('data-map');
    groupNameInput = document.getElementById('group-name');
    applyGroupBtn = document.getElementById('apply-group-btn');
    groupTogglesContainer = document.getElementById('group-toggles');
    exportFormatSelect = document.getElementById('export-format');
    outputData = document.getElementById('output-data');
    ridSelect = document.getElementById('rid-select');
    dataSelectionContainer = document.getElementById('data-selection-container');
    restorePointsBtn = document.getElementById('restore-points-btn');
    fitScreenBtn = document.getElementById('fit-screen-btn');
    
    // Initialize map
    initializeMap();
    
    // Initialize chart plugins
    initializeChartPlugins();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Initializes Chart.js plugins for selection functionality
 */
function initializeChartPlugins() {
    // We'll use direct event listeners instead of Chart.js plugins
    // to avoid infinite recursion issues
    
    // Add direct event listeners to the canvas for better control
    if (chartCanvas) {
        chartCanvas.addEventListener('mousedown', handleChartMouseDown);
        chartCanvas.addEventListener('mousemove', handleChartMouseMove);
        chartCanvas.addEventListener('mouseup', handleChartMouseUp);
        chartCanvas.addEventListener('mouseleave', handleChartMouseLeave);
        // Removed: chartCanvas.addEventListener('click', handlePointRemoval);
    }
}

/**
 * Handles mouse down event on chart
 */
function handleChartMouseDown(event) {
    if (!chart) return;
    
    // If R key is pressed, handle point removal instead of selection
    if (isRKeyPressed) {
        console.log('Chart clicked while R key is pressed');
        handlePointRemoval(event);
        return;
    }
    
    const rect = chartCanvas.getBoundingClientRect();
    dragStart = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
    isSelecting = true;
    selectedArea = null;
}

/**
 * Handles mouse move event on chart
 */
function handleChartMouseMove(event) {
    if (!chart || !isSelecting || isUpdating) return;
    
    const rect = chartCanvas.getBoundingClientRect();
    selectedArea = {
        x1: dragStart.x,
        y1: dragStart.y,
        x2: event.clientX - rect.left,
        y2: event.clientY - rect.top
    };
    
    // Request animation frame for smoother drawing
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(() => {
            // Draw selection rectangle without updating the chart
            drawSelectionRectangle();
            animationFrameId = null;
        });
    }
}

/**
 * Draws the selection rectangle on the chart canvas
 */
function drawSelectionRectangle() {
    if (!chart || !selectedArea) return;
    
    // Get the chart context
    const ctx = chart.ctx;
    
    // Save the current state
    ctx.save();
    
    // Clear the canvas and redraw the chart
    chart.draw();
    
    // Draw the selection rectangle with more visible colors
    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)'; // Orange with transparency
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)'; // Orange border
    ctx.lineWidth = 2; // Thicker border
    
    const width = selectedArea.x2 - selectedArea.x1;
    const height = selectedArea.y2 - selectedArea.y1;
    
    ctx.fillRect(selectedArea.x1, selectedArea.y1, width, height);
    ctx.strokeRect(selectedArea.x1, selectedArea.y1, width, height);
    
    // Restore the context
    ctx.restore();
}

/**
 * Handles mouse up event on chart
 */
function handleChartMouseUp(event) {
    if (!chart || !isSelecting) return;
    
    if (selectedArea) {
        const rect = chartCanvas.getBoundingClientRect();
        selectedArea.x2 = event.clientX - rect.left;
        selectedArea.y2 = event.clientY - rect.top;
        
        // Convert pixel coordinates to data values
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        
        const x1Value = xScale.getValueForPixel(selectedArea.x1);
        const x2Value = xScale.getValueForPixel(selectedArea.x2);
        const y1Value = yScale.getValueForPixel(selectedArea.y1);
        const y2Value = yScale.getValueForPixel(selectedArea.y2);
        
        // Ensure correct order
        const minX = Math.min(x1Value, x2Value);
        const maxX = Math.max(x1Value, x2Value);
        const minY = Math.min(y1Value, y2Value);
        const maxY = Math.max(y1Value, y2Value);
        
        // Find data points in the selected area
        // Use filteredData if available, otherwise use parsedData
        const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
        
        // Determine which parameter to use for the y-axis (prefer current if available)
        const displayParameter = dataToUse.some(point => point.current !== undefined) ? 'current' : activeParameter;
        console.log('Using display parameter for selection:', displayParameter);
        
        // Get all points in the selected area
        const pointsInArea = dataToUse.filter(point => {
            const pointValue = point[displayParameter] !== undefined ? 
                point[displayParameter] : point[activeParameter];
            
            return point.station >= minX && 
                   point.station <= maxX && 
                   pointValue >= minY && 
                   pointValue <= maxY;
        });
        
        // Check if we're in edit mode (shift key pressed)
        const isRemoveMode = event.shiftKey;
        
        // If we're in remove mode, remove the selected points from the current selection
        if (isRemoveMode) {
            selectedDataPoints = selectedDataPoints.filter(selectedPoint => 
                !pointsInArea.some(point => point.station === selectedPoint.station)
            );
        } else {
            // Check for points already in groups
            const pointsAlreadyInGroups = [];
            const newPointsToAdd = [];
            
            pointsInArea.forEach(point => {
                let isInGroup = false;
                
                // Check if this point is already in any group
                for (const group of customGroups) {
                    if (currentRID && group.rid === currentRID && 
                        group.points.some(p => p.station === point.station)) {
                        pointsAlreadyInGroups.push(point);
                        isInGroup = true;
                        break;
                    }
                }
                
                // Only add if not already in the selection
                if (!selectedDataPoints.some(selectedPoint => selectedPoint.station === point.station)) {
                    if (!isInGroup) {
                        newPointsToAdd.push(point);
                    }
                }
            });
            
            // Add new points to selection
            selectedDataPoints = [...selectedDataPoints, ...newPointsToAdd];
            
            // Show warning if some points were already in groups
            if (pointsAlreadyInGroups.length > 0) {
                showMessage(`${pointsAlreadyInGroups.length} points are already in groups and will be skipped.`, 'warning');
            }
        }
        
        // Update the chart to show the selection
        updateSelectionDisplay();
        
        // Update selection details
        updateSelectionDetails();
        
        // Enable group controls if we have selected points
        if (selectedDataPoints.length > 0) {
            if (groupNameInput) {
                groupNameInput.disabled = false;
                
                // Set default group name if the input is empty
                if (!groupNameInput.value.trim()) {
                    const nextGroupNumber = customGroups.filter(g => g.rid === currentRID).length + 1;
                    groupNameInput.value = `Group ${nextGroupNumber}`;
                }
            }
            if (applyGroupBtn) applyGroupBtn.disabled = false;
        } else {
            if (groupNameInput) groupNameInput.disabled = true;
            if (applyGroupBtn) applyGroupBtn.disabled = true;
        }
    }
    
    // Reset selection state
    isSelecting = false;
    selectedArea = null;
    
    // Cancel any pending animation frame
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Redraw the chart to clear the selection rectangle
    if (chart) {
        chart.draw();
    }
}

/**
 * Handles point removal when clicking on a point while the R key is pressed
 * @param {MouseEvent} event - The mouse click event
 */
function handlePointRemoval(event) {
    console.log('Point removal handler called, R key pressed:', isRKeyPressed);
    if (!chart || !isRKeyPressed) return; // Restore the isRKeyPressed check
    
    // Get mouse position relative to canvas
    const rect = chartCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    console.log('Click position:', x, y);
    
    // Convert pixel coordinates to data values
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const xValue = xScale.getValueForPixel(x);
    const yValue = yScale.getValueForPixel(y);
    
    console.log('Data values:', xValue, yValue);
    
    // Use filteredData if available, otherwise use parsedData
    const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
    console.log('Data points to search:', dataToUse.length);
    
    // Determine which parameter to use for the y-axis (prefer current if available)
    const displayParameter = dataToUse.some(point => point.current !== undefined) ? 'current' : activeParameter;
    console.log('Using display parameter:', displayParameter);
    
    // Find the closest point to the click
    let closestPoint = null;
    let minDistance = Infinity;
    
    dataToUse.forEach(point => {
        // Skip points that are already removed
        if (removedPoints.some(p => p.station === point.station)) return;
        
        // Calculate distance between click and point
        const dx = Math.abs(point.station - xValue);
        const pointValue = point[displayParameter] !== undefined ? point[displayParameter] : point[activeParameter];
        const dy = Math.abs(pointValue - yValue);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if this point is closer than the current closest
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = point;
        }
    });
    
    console.log('Closest point found:', closestPoint ? `Station: ${closestPoint.station}, Distance: ${minDistance}` : 'None');
    
    // Define a threshold for how close the click needs to be to a point
    // This is in data units, not pixels
    const clickThreshold = {
        x: Math.abs(xScale.getValueForPixel(x + 10) - xScale.getValueForPixel(x)),
        y: Math.abs(yScale.getValueForPixel(y + 10) - yScale.getValueForPixel(y))
    };
    
    console.log('Click threshold:', clickThreshold);
    
    // Check if we found a point and it's close enough to the click
    if (closestPoint) {
        const xDiff = Math.abs(closestPoint.station - xValue);
        const pointValue = closestPoint[displayParameter] !== undefined ? 
            closestPoint[displayParameter] : closestPoint[activeParameter];
        const yDiff = Math.abs(pointValue - yValue);
        console.log('Point differences:', {
            x: xDiff, 
            y: yDiff, 
            xThreshold: clickThreshold.x * 10, // Increased from 5 to 10
            yThreshold: clickThreshold.y * 10, // Increased from 5 to 10
            withinThreshold: xDiff < clickThreshold.x * 10 && yDiff < clickThreshold.y * 10
        });
        
        if (xDiff < clickThreshold.x * 10 && yDiff < clickThreshold.y * 10) { // Increased from 5 to 10
            console.log('Point will be removed:', closestPoint);
            // Add to removed points
            removedPoints.push({...closestPoint});
            
            // Remove from selection if it's selected
            selectedDataPoints = selectedDataPoints.filter(p => p.station !== closestPoint.station);
            
            // Update the chart
            safeChartUpdate();
            
            // Enable restore button
            if (restorePointsBtn) {
                restorePointsBtn.disabled = false;
            }
            
            // Enable fit to screen button
            if (fitScreenBtn) {
                fitScreenBtn.disabled = false;
            }
            
            // Show message
            showMessage(`Point at station ${formatStation(closestPoint.station)} removed from chart view. It will still be included in exports.`, 'success');
        }
    }
}

/**
 * Handles mouse leave event on chart
 */
function handleChartMouseLeave() {
    if (isSelecting) {
        isSelecting = false;
        selectedArea = null;
        if (chart) {
            safeChartUpdate();
        }
    }
}

/**
 * Safely updates the chart to prevent recursive updates
 */
function safeChartUpdate() {
    if (isUpdating || !chart) return;
    
    isUpdating = true;
    
    try {
        // Refresh the chart to show selection
        // Use filteredData if available, otherwise use parsedData
        const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
        
        try {
            updateChart(dataToUse);
        } catch (error) {
            console.error('Error updating chart:', error);
            showMessage('Error updating chart: ' + error.message, 'error');
        }
    } catch (error) {
        console.error('Error in safeChartUpdate:', error);
    } finally {
        isUpdating = false;
    }
}

/**
 * Handles the data processing when the user clicks the process button
 */
function handleProcessData() {
    if (fileInput.files && fileInput.files.length > 0) {
        processFile(fileInput.files[0]);
    } else {
        showMessage('Please select a file first.', 'error');
    }
}

/**
 * Handles file selection from either drag-drop or file input
 * @param {FileList} files - The selected files
 */
function handleFileSelection(files) {
    if (!files || files.length === 0) {
        return;
    }
    
    const file = files[0];
    
    // Check if file is Excel (.xlsx)
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        showMessage('Please select an Excel (.xlsx) file.', 'error');
        fileStatus.textContent = 'Invalid file type. Please select an Excel (.xlsx) file.';
        return;
    }
    
    // Update file status
    fileStatus.textContent = `Selected: ${file.name}`;
    
    // Automatically process the file
    processFile(file);
}

/**
 * Processes the uploaded file and extracts data
 * @param {File} file - The uploaded file
 */
function processFile(file) {
    try {
        // Show loading message
        showMessage('Processing data...', 'success');
        
        // Read file content
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                // Parse Excel file content
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get the first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (jsonData.length <= 1) { // Check if there's only a header row or less
                    showMessage('No valid data found in the file.', 'error');
                    return;
                }
                
                // Process the Excel data
                parsedData = parseExcelData(jsonData);
                
                if (parsedData.length === 0) {
                    showMessage('No valid data found in the file.', 'error');
                    return;
                }
                
                // Check if we have RID data and populate the dropdown
                const ridSelect = document.getElementById('rid-select');
                const dataSelectionContainer = document.getElementById('data-selection-container');
                
                // Get unique RIDs
                const uniqueRIDs = [...new Set(parsedData.map(item => item.rid).filter(rid => rid !== undefined))];
                
                if (uniqueRIDs.length > 0) {
                    // Show the RID selection container
                    if (dataSelectionContainer) {
                        dataSelectionContainer.style.display = 'block';
                    }
                    
                    // Clear existing options except the first one
                    if (ridSelect) {
                        while (ridSelect.options.length > 1) {
                            ridSelect.remove(1);
                        }
                        
                        // Add options for each unique RID
                        uniqueRIDs.forEach(rid => {
                            const option = document.createElement('option');
                            option.value = rid;
                            option.textContent = `RID: ${rid}`;
                            ridSelect.appendChild(option);
                        });
                        
                        // Enable the dropdown
                        ridSelect.disabled = false;
                        
                        // Add event listener for RID selection
                        ridSelect.addEventListener('change', handleRIDSelection);
                        
                        // Show message to select a RID
                        showMessage('Please select a data set (RID) to continue.', 'info');
                        
                        // Don't process data yet - wait for RID selection
                        return;
                    }
                } else {
                    // No RID data, hide the selection container
                    if (dataSelectionContainer) {
                        dataSelectionContainer.style.display = 'none';
                    }
                    
                    // Process all data
                    organizeDataParameters(parsedData);
                    processAndDisplayData(parsedData);
                }
                
                // Enable manual grouping controls
                if (applyGroupBtn) applyGroupBtn.disabled = false;
                
                // Enable suggest groups button
                if (applyGroupBtn) applyGroupBtn.disabled = false;
                
                // Grouping controls remain disabled until selection is made
                if (groupNameInput) groupNameInput.disabled = true;
                
                // Enable download button
                if (downloadButton) downloadButton.disabled = false;
                
                showMessage('Data processed successfully.', 'success');
            } catch (error) {
                console.error('Error processing file:', error);
                showMessage(`Error processing file: ${error.message}`, 'error');
            }
        };
        
        reader.onerror = function() {
            showMessage('Error reading file.', 'error');
        };
        
        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('Error processing file:', error);
        showMessage(`Error processing file: ${error.message}`, 'error');
    }
}

/**
 * Parses Excel data from SheetJS into a structured format
 * @param {Array} jsonData - The JSON data from SheetJS
 * @returns {Array} - Structured data array
 */
function parseExcelData(jsonData) {
    const data = [];
    
    // Check if first row is a header (it should be)
    const headers = jsonData[0].map(h => String(h).trim().toLowerCase());
    
    // Find required columns (MEAS for station, SIGNAL for value)
    const stationIndex = headers.findIndex(h => h === 'meas');
    // Look for exact match first, then fall back to includes if not found
    let valueIndex = headers.findIndex(h => h === 'signal');
    if (valueIndex === -1) {
        // If exact match not found, try case-insensitive includes
        valueIndex = headers.findIndex(h => h.includes('signal'));
        console.log('Exact "signal" column not found, using column that includes "signal":', 
            valueIndex !== -1 ? jsonData[0][valueIndex] : 'None found');
    }
    const pointTypeIndex = headers.findIndex(h => h === 'pointtype');
    const xIndex = headers.findIndex(h => h === 'x');
    const yIndex = headers.findIndex(h => h === 'y');
    const ridIndex = headers.findIndex(h => h === 'rid');
    const createdOnIndex = headers.findIndex(h => h === 'createdon');
    
    // Log column indices for debugging
    console.log('Column indices:', {
        station: stationIndex,
        value: valueIndex,
        pointType: pointTypeIndex,
        x: xIndex,
        y: yIndex,
        rid: ridIndex,
        createdOn: createdOnIndex
    });
    
    if (stationIndex === -1 || valueIndex === -1) {
        showMessage('Required columns (MEAS, SIGNAL) not found in the Excel file.', 'error');
        return [];
    }
    
    // Process each row (skip header)
    for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Skip empty rows
        if (!row || row.length === 0) continue;
        
        const dataPoint = {};
        
        // Map all columns to properties
        headers.forEach((header, index) => {
            if (index < row.length && row[index] !== undefined) {
                // Try to convert to number if possible, except for date fields
                if (header === 'createdon') {
                    // Keep as string or convert to Date object if needed
                    dataPoint[header] = row[index];
                } else {
                    const value = parseFloat(row[index]);
                    dataPoint[header] = isNaN(value) ? row[index] : value;
                }
            }
        });
        
        // Ensure required fields exist and map to standard names
        if (row[stationIndex] !== undefined) {
            // Map MEAS to station
            dataPoint.station = parseFloat(row[stationIndex]);
            
            // Map SIGNAL to value and signal
            if (row[valueIndex] !== undefined) {
                const signalValue = parseFloat(row[valueIndex]);
                dataPoint.value = signalValue;
                dataPoint.signal = signalValue; // Add signal property for consistency
                
                // Calculate current in dBmA using the formula: LOG10(signal_value) * 20
                if (signalValue > 0) {
                    dataPoint.current = Math.log10(signalValue) * 20;
                } else {
                    // Handle zero or negative values (log10 is undefined for these)
                    dataPoint.current = -60; // Default low value for zero/negative signals
                    console.log(`Warning: Non-positive signal value (${signalValue}) at station ${dataPoint.station}, using default current value`);
                }
            }
            
            // Map X, Y to latitude, longitude if they exist
            if (xIndex !== -1 && yIndex !== -1 && row[xIndex] !== undefined && row[yIndex] !== undefined) {
                // Store both original X/Y and mapped latitude/longitude
                dataPoint.x = parseFloat(row[xIndex]);
                dataPoint.y = parseFloat(row[yIndex]);
                dataPoint.longitude = parseFloat(row[xIndex]);
                dataPoint.latitude = parseFloat(row[yIndex]);
                
                console.log(`Row ${i}: Mapped coordinates - X: ${dataPoint.x}, Y: ${dataPoint.y}, Lat: ${dataPoint.latitude}, Lng: ${dataPoint.longitude}`);
            }
            
            // Add pointtype if it exists
            if (pointTypeIndex !== -1 && row[pointTypeIndex] !== undefined) {
                dataPoint.pointtype = row[pointTypeIndex];
            }
            
            // Add RID if it exists
            if (ridIndex !== -1 && row[ridIndex] !== undefined) {
                dataPoint.rid = row[ridIndex];
            }
            
            // Add Createdon if it exists
            if (createdOnIndex !== -1 && row[createdOnIndex] !== undefined) {
                dataPoint.createdon = row[createdOnIndex];
            }
            
            // Add anomaly detection (simple example - can be enhanced)
            if (!dataPoint.anomaly) {
                dataPoint.anomaly = 0; // 0 = no anomaly, 1 = possible anomaly, 2 = definite anomaly
            }
            
            // Add group property for custom grouping
            dataPoint.group = null;
            
            // Add to data array if it has the required fields
            // Modified to include points with station and pointtype, even if they don't have signal values
            if (dataPoint.station !== undefined && 
                ((dataPoint.value !== undefined || dataPoint.signal !== undefined) || 
                 (dataPoint.pointtype !== undefined))) {
                data.push(dataPoint);
            }
        }
    }
    
    // Sort data by station for easier processing
    data.sort((a, b) => a.station - b.station);
    
    // Log unique RIDs and data points count for debugging
    const uniqueRIDs = [...new Set(data.map(item => item.rid).filter(rid => rid !== undefined))];
    console.log(`Found ${uniqueRIDs.length} unique RIDs:`, uniqueRIDs);
    console.log(`Total data points: ${data.length}`);
    
    // Log how many points have geographic coordinates
    const pointsWithCoords = data.filter(point => 
        (point.latitude !== undefined && point.longitude !== undefined) || 
        (point.x !== undefined && point.y !== undefined)
    ).length;
    console.log(`Points with geographic coordinates: ${pointsWithCoords} (${((pointsWithCoords/data.length)*100).toFixed(1)}%)`);
    
    return data;
}

/**
 * Organizes data parameters for selection dropdown
 * @param {Array} data - The parsed data
 */
function organizeDataParameters(data) {
    // Reset parameters
    dataParameters = {
        current: [],
        potential: [],
        anomalies: []
    };
    
    // Check what parameters are available in the data
    const samplePoint = data[0] || {};
    const availableParams = Object.keys(samplePoint);
    
    // Check if current values are available
    const hasCurrentValues = data.some(point => point.current !== undefined);
    
    // Update parameter select dropdown if it exists
    if (parameterSelect) {
        // Clear existing options
        parameterSelect.innerHTML = '';
        
        // Always add station
        const stationOption = document.createElement('option');
        stationOption.value = 'station';
        stationOption.textContent = 'Station';
        parameterSelect.appendChild(stationOption);
        
        // Add signal option
        const signalOption = document.createElement('option');
        signalOption.value = 'signal';
        signalOption.textContent = 'Signal (mA)';
        // Only select signal if current is not available
        signalOption.selected = !hasCurrentValues;
        parameterSelect.appendChild(signalOption);
        
        // Add current option if available
        if (hasCurrentValues) {
            const currentOption = document.createElement('option');
            currentOption.value = 'current';
            currentOption.textContent = 'Current (dBmA)';
            currentOption.selected = true; // Make current the default if available
            parameterSelect.appendChild(currentOption);
            
            // Update active parameter to current
            activeParameter = 'current';
        }
        
        // Add other available parameters
        availableParams.forEach(param => {
            if (param !== 'station' && param !== 'signal' && param !== 'current' && param !== 'value') {
                const option = document.createElement('option');
                option.value = param;
                option.textContent = param.charAt(0).toUpperCase() + param.slice(1);
                parameterSelect.appendChild(option);
                
                // Collect parameter data
                if (param === 'potential' || param === 'anomaly') {
                    dataParameters[param] = data.map(point => ({
                        station: point.station,
                        value: point[param]
                    }));
                }
            }
        });
    }
}

/**
 * Process and display the data
 * @param {Array} dataToProcess - The data to process and display
 */
function processAndDisplayData(dataToProcess) {
    try {
        // Clear any previous chart
        if (chart) {
            chart.destroy();
            chart = null; // Set chart to null after destroying it
        }
        
        // Update chart with the data
        updateChart(dataToProcess);
        
        // Ensure chart event listeners are set up
        initializeChartPlugins();
        
        // Update the output display
        updateOutputDisplay(dataToProcess);
        
        // Update map with all data points
        updateMapWithAllData(dataToProcess);
        
        // Enable controls
        if (groupNameInput) groupNameInput.disabled = false;
        if (applyGroupBtn) applyGroupBtn.disabled = false;
        if (downloadButton) downloadButton.disabled = false;
        if (exportFormatSelect) exportFormatSelect.disabled = false;
        
        showMessage('Data processed successfully.', 'success');
    } catch (error) {
        console.error('Error processing data:', error);
        showMessage(`Error processing data: ${error.message}`, 'error');
    }
}

/**
 * Updates chart datasets with custom groups
 * @param {Array} datasets - The current chart datasets
 * @returns {Array} - Updated datasets with custom groups
 */
function updateChartWithCustomGroups(datasets) {
    // If no custom groups, return original datasets
    if (!customGroups || customGroups.length === 0) {
        return datasets;
    }
    
    // Filter groups by current RID
    const ridGroups = currentRID 
        ? customGroups.filter(group => group.rid === currentRID)
        : [];
    
    if (ridGroups.length === 0) {
        return datasets;
    }
    
    // Determine which parameter to use for the y-axis (prefer current if available)
    const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
    const displayParameter = dataToUse.some(point => point.current !== undefined) ? 'current' : activeParameter;
    console.log('Using display parameter for custom groups:', displayParameter);
    
    // Add each custom group as a dataset
    ridGroups.forEach((group) => {
        // Skip if group is not visible
        if (!group.visible) {
            return;
        }
        
        // Use the group's color directly - ensure it's in rgba format for consistency
        let color = group.color;
        
        // If color is in hex format, convert to rgba
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            color = `rgba(${r}, ${g}, ${b}, 0.8)`;
        }
        
        // Filter out removed points from this group
        const visibleGroupPoints = group.points.filter(point => 
            !removedPoints.some(removedPoint => removedPoint.station === point.station)
        );
        
        if (visibleGroupPoints.length === 0) {
            return; // Skip empty groups
        }
        
        // Calculate min/max values for station and y-axis parameter
        const yValues = visibleGroupPoints.map(point => 
            point[displayParameter] !== undefined ? point[displayParameter] : point[activeParameter]
        );
        const stationValues = visibleGroupPoints.map(point => point.station);
        
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        const minStation = Math.min(...stationValues);
        const maxStation = Math.max(...stationValues);
        
        // Create a dataset for this group's points
        const groupDataset = {
            label: group.name,
            data: visibleGroupPoints.map(point => ({
                x: point.station,
                y: point[displayParameter] !== undefined ? point[displayParameter] : point[activeParameter]
            })),
            backgroundColor: color,
            borderColor: color,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointStyle: 'circle',
            showLine: false,
            customGroup: true, // Mark as custom group for reference
            groupId: group.id // Store group ID for reference
        };
        
        // Add datasets to array
        datasets.push(groupDataset); // Add the actual data points
    });
    
    return datasets;
}

/**
 * Calculates the percentage change per 100 feet between consecutive data points
 * @param {Array} data - The sorted data array
 * @param {Object} group - Optional group object to calculate changes for a specific group
 * @returns {Array} - Array of percentage change values
 */
function calculatePercentageChange(data, group = null) {
    try {
        if (!data || data.length < 2) {
            console.log('Not enough data points for percentage change calculation');
            return [];
        }
        
        // If a specific group is provided, use only those points
        const dataToProcess = group ? [...group.points] : [...data];
        
        // Sort data by station
        const sortedData = dataToProcess.sort((a, b) => a.station - b.station);
        console.log(`Calculating percentage change for ${sortedData.length} sorted data points${group ? ` in group "${group.name}"` : ''}`);
        
        // Calculate percentage change per 100 feet
        const percentageChanges = [];
        
        // If we're using filtered data (specific RID), we're already working with a single RID
        // Otherwise, we need to calculate percentage changes for each RID separately
        if (filteredData.length > 0 || group) {
            // We're already working with a specific RID or group
            calculateChangesForDataSet(sortedData, percentageChanges, group);
        } else {
            // Check if data has RID property
            const hasRID = sortedData.some(point => point.rid !== undefined);
            
            if (hasRID) {
                // Group data by RID
                const ridGroups = {};
                sortedData.forEach(point => {
                    const rid = point.rid || 'unknown';
                    if (!ridGroups[rid]) {
                        ridGroups[rid] = [];
                    }
                    ridGroups[rid].push(point);
                });
                
                // Calculate percentage changes for each RID group
                Object.keys(ridGroups).forEach(rid => {
                    if (ridGroups[rid].length >= 2) {
                        console.log(`Calculating percentage change for RID: ${rid} with ${ridGroups[rid].length} points`);
                        calculateChangesForDataSet(ridGroups[rid], percentageChanges);
                    }
                });
            } else {
                // No RID property, treat all data as one set
                calculateChangesForDataSet(sortedData, percentageChanges);
            }
        }
        
        console.log(`Generated ${percentageChanges.length} percentage change points${group ? ` for group "${group.name}"` : ''}`);
        return percentageChanges;
    } catch (error) {
        console.error('Error calculating percentage change:', error);
        showMessage('Error calculating percentage change: ' + error.message, 'error');
        return [];
    }
}

/**
 * Helper function to calculate percentage changes for a dataset
 * @param {Array} dataSet - Array of data points
 * @param {Array} results - Array to store results
 * @param {Object} group - Optional group object for group-specific calculations
 */
function calculateChangesForDataSet(dataSet, results, group = null) {
    // Ensure data is sorted by station
    const sortedSet = [...dataSet].sort((a, b) => a.station - b.station);
    
    // Skip if no data points
    if (sortedSet.length === 0) return;
    
    // Group data by Route ID if available
    const ridGroups = {};
    
    // Check if data has RID property
    const hasRID = sortedSet.some(point => point.rid !== undefined);
    
    if (hasRID) {
        // Group data by RID
        sortedSet.forEach(point => {
            const rid = point.rid || 'unknown';
            if (!ridGroups[rid]) {
                ridGroups[rid] = [];
            }
            ridGroups[rid].push(point);
        });
        
        // Process each RID group separately
        Object.keys(ridGroups).forEach(rid => {
            if (ridGroups[rid].length >= 2) {
                processRIDGroup(ridGroups[rid], results, group);
            }
        });
    } else {
        // No RID property, treat all data as one set
        processRIDGroup(sortedSet, results, group);
    }
}

/**
 * Process a group of points with the same Route ID
 * @param {Array} points - Array of data points with the same RID
 * @param {Array} results - Array to store results
 * @param {Object} group - Optional group object for group-specific calculations
 */
function processRIDGroup(points, results, group = null) {
    // Sort points by station
    const sortedPoints = [...points].sort((a, b) => a.station - b.station);
    
    // Skip if we don't have enough points
    if (sortedPoints.length < 2) return;
    
    // Use the first point as the reference point
    const referencePoint = sortedPoints[0];
    
    // Get the reference current value (use current if available, otherwise use the active parameter)
    const referenceValue = referencePoint.current !== undefined ? 
        referencePoint.current : 
        referencePoint[activeParameter];
    
    // Get the second point to calculate the initial percentage change
    const secondPoint = sortedPoints[1];
    
    // Calculate distance between first and second points
    const initialDistance = Math.abs(secondPoint.station - referencePoint.station);
    
    // Skip if distance is too small
    if (initialDistance < 0.1) {
        console.log(`Skipping group - distance between first two points too small: ${initialDistance}`);
        return;
    }
    
    // Get the current value for the second point
    const secondPointValue = secondPoint.current !== undefined ? 
        secondPoint.current : 
        secondPoint[activeParameter];
    
    // Skip if second point value is too close to zero
    if (Math.abs(secondPointValue) < 0.0001) {
        console.log(`Skipping group - second point value too close to zero: ${secondPointValue}`);
        return;
    }
    
    // Calculate percentage change using the updated formula with currentValue as divisor
    const groupPercentChange = Math.abs((referenceValue - secondPointValue) / secondPointValue / initialDistance * 100);
    
    // Cap extreme values for display purposes
    const cappedGroupPercentChange = groupPercentChange > 100 ? 100 : groupPercentChange;
    
    // Skip if the percentage change is invalid
    if (!isNaN(groupPercentChange) && isFinite(groupPercentChange)) {
        console.log(`Group "${group ? group.name : 'default'}": Calculated percentage change ${groupPercentChange.toFixed(3)}% (capped: ${cappedGroupPercentChange.toFixed(3)}%)`);
        
        // Apply this same percentage change to all points in the group (except the first point)
        for (let i = 1; i < sortedPoints.length; i++) {
            const currentPoint = sortedPoints[i];
            
            // Skip if stations are the same as reference
            if (currentPoint.station === referencePoint.station) continue;
            
            // Use the same percentage change for all points in the group
            results.push({
                station: currentPoint.station,
                percentChange: cappedGroupPercentChange,
                actualPercentChange: groupPercentChange,
                rid: currentPoint.rid,
                groupId: group ? group.id : null,
                groupName: group ? group.name : null,
                groupColor: group ? group.color : null,
                referenceStation: referencePoint.station,
                distance: Math.abs(currentPoint.station - referencePoint.station),
                isGroupValue: true // Flag to indicate this is a group-wide value
            });
        }
    } else {
        console.log(`Invalid group percentage change: ${groupPercentChange}`);
    }
}

/**
 * Updates the chart with the provided data
 * @param {Array} dataToDisplay - The data to display on the chart
 */
function updateChart(dataToDisplay) {
    // Use the appropriate data source
    const dataToUse = dataToDisplay || (filteredData.length > 0 ? filteredData : parsedData);
    
    console.log(`Updating chart with ${dataToUse.length} data points`);
    
    // Filter out removed points for chart display only
    const visibleData = dataToUse.filter(point => 
        !removedPoints.some(removedPoint => removedPoint.station === point.station)
    );
    
    console.log(`${dataToUse.length - visibleData.length} points are hidden from chart`);
    
    // Filter out points without signal values for chart display
    const chartableData = visibleData.filter(point => 
        point.current !== undefined || point[activeParameter] !== undefined
    );
    
    console.log(`${visibleData.length - chartableData.length} points don't have signal values and won't be shown on chart`);
    
    // Determine which parameter to use for the y-axis (prefer current if available)
    const displayParameter = chartableData.some(point => point.current !== undefined) ? 'current' : activeParameter;
    
    // Prepare chart data
    let datasets = [
        {
            label: `Current (dBmA)`,
            data: chartableData.map(item => ({ 
                x: item.station, 
                y: item.current !== undefined ? item.current : item[activeParameter] 
            })),
            backgroundColor: 'rgba(0, 123, 255, 0.7)',
            borderColor: 'rgb(0, 123, 255)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            type: 'scatter',
            yAxisID: 'y',
            order: 1,
            showLine: true,
            tension: 0.1 // Adds slight curve to the line for better visualization
        }
    ];
    
    // Filter groups by current RID
    const ridGroups = currentRID 
        ? customGroups.filter(group => group.rid === currentRID && group.visible)
        : [];
    
    // Calculate percentage change data for all visible data
    let allPercentageChanges = calculatePercentageChange(chartableData);
    
    // Track if any group percentage changes were added
    let groupPercentageChangesAdded = false;
    
    // Calculate percentage changes for each custom group
    if (ridGroups.length > 0) {
        ridGroups.forEach(group => {
            // Skip if group has less than 2 points (need at least 2 for percentage change)
            if (group.points.length < 2) return;
            
            // Calculate percentage changes for this group
            const groupPercentageChanges = calculatePercentageChange(group.points, group);
            
            if (groupPercentageChanges.length > 0) {
                groupPercentageChangesAdded = true;
                
                // Create a slightly transparent version of the group color for the bars
                let barColor = group.color;
                
                // If color is in hex format, convert to rgba
                if (barColor.startsWith('#')) {
                    const r = parseInt(barColor.slice(1, 3), 16);
                    const g = parseInt(barColor.slice(3, 5), 16);
                    const b = parseInt(barColor.slice(5, 7), 16);
                    barColor = `rgba(${r}, ${g}, ${b}, 0.7)`;
                }
                
                // Sort the points by station
                const sortedPoints = [...group.points].sort((a, b) => a.station - b.station);
                
                // Get the first and last points in the group
                const firstPoint = sortedPoints[0];
                const lastPoint = sortedPoints[sortedPoints.length - 1];
                
                // Get the percentage change value (all points have the same value)
                const percentChangeValue = groupPercentageChanges[0].percentChange;
                
                // Create a custom dataset for a continuous bar
                // Instead of creating a data point for each station, we'll create a special dataset
                // that will be rendered as a continuous bar spanning from first to last point
                
                // Add percentage change dataset for this group as a continuous bar
                datasets.push({
                    label: `${group.name} % Change`,
                    // Empty data array - we don't need actual points
                    data: [],
                    backgroundColor: barColor.replace(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/, 'rgba($1, $2, $3, 0.5)'), // More transparent
                    borderColor: group.color,
                    borderWidth: 1,
                    // Use special properties for continuous bar rendering
                    yAxisID: 'y1',
                    order: 0,
                    groupId: group.id,
                    // Add custom properties for the continuous bar
                    continuousBar: true,
                    startX: firstPoint.station,
                    endX: lastPoint.station,
                    barValue: percentChangeValue
                });
            }
        });
    }
    
    // Add percentage change dataset if we have data AND no group percentage changes were added
    if (allPercentageChanges.length > 0 && !groupPercentageChangesAdded) {
        datasets.push({
            label: '% Current Change/100 ft',
            data: allPercentageChanges.map(item => ({ x: item.station, y: item.percentChange })),
            backgroundColor: 'rgba(255, 165, 0, 0.7)', // Orange
            borderColor: 'rgb(255, 165, 0)', // Orange
            borderWidth: 1,
            pointRadius: 0, // No points for bar chart
            pointHoverRadius: 0,
            barPercentage: 0.3, // Reduce bar width to prevent overlap
            categoryPercentage: 0.5,
            type: 'bar',
            yAxisID: 'y1', // Use right y-axis
            order: 0
        });
    }
    
    // Add anomaly points if available (filter out removed points)
    const anomalyPoints = visibleData.filter(item => item.anomaly > 0);
    if (anomalyPoints.length > 0) {
        datasets.push({
            label: `Anomalies (${anomalyPoints.length} points)`,
            data: anomalyPoints.map(item => ({ 
                x: item.station, 
                y: item[displayParameter] !== undefined ? item[displayParameter] : item[activeParameter] 
            })),
            backgroundColor: 'rgba(255, 206, 86, 0.7)',
            borderColor: 'rgb(255, 206, 86)',
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointStyle: 'triangle',
            type: 'scatter',
            yAxisID: 'y',
            order: 0
        });
    }
    
    // Add custom groups to datasets (filter out removed points)
    datasets = updateChartWithCustomGroups(datasets);
    
    // Add transition bars between adjacent groups if we have visible groups
    if (ridGroups && ridGroups.length >= 2) {
        console.log(`Adding transition bars between ${ridGroups.length} groups`);
        datasets = addGroupTransitionBars(datasets, ridGroups);
    } else {
        console.log('Not enough groups for transition bars:', ridGroups ? ridGroups.length : 0);
    }
    
    // Create or update chart
    if (chart) {
        try {
            // Update datasets without triggering a full redraw
            chart.data.datasets = datasets;
            
            // Update axis labels based on active parameter
            chart.options.scales.y.title.text = 'Current (dBmA)';
            chart.options.scales.y.title.color = '#fff';
            chart.options.scales.y.title.font = {
                size: 16,
                weight: 'bold'
            };
            
            // Remove threshold line annotation if it exists
            if (chart.options.plugins.annotation) {
                chart.options.plugins.annotation.annotations = {};
            }
            
            // Update the chart
            chart.update();
        } catch (error) {
            console.error('Error updating existing chart:', error);
            // If updating fails, destroy the chart and create a new one
            chart.destroy();
            chart = null;
            // The chart will be recreated below
        }
    }
    
    // Create a new chart if it doesn't exist or was destroyed
    if (!chart) {
        try {
            const chartElement = document.getElementById('data-chart');
            if (!chartElement) {
                console.error('Chart element not found');
                return;
            }
            
            const ctx = chartElement.getContext('2d');
            chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 500
                    },
                    interaction: {
                        mode: 'nearest',
                        intersect: true, // Change to true to only show tooltip when hovering directly over a point
                    },
                    // Add auto-fit functionality
                    onResize: function(chart, size) {
                        // Adjust the chart to fit the screen
                        setTimeout(() => {
                            // Reset zoom to fit all data
                            if (chart.scales.x && chart.scales.y) {
                                chart.resetZoom();
                            }
                        }, 100);
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: '#fff',
                                font: {
                                    size: 12
                                },
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            titleFont: {
                                size: 14,
                                weight: 'bold'
                            },
                            bodyFont: {
                                size: 13
                            },
                            padding: 10,
                            cornerRadius: 4,
                            displayColors: true,
                            callbacks: {
                                title: function(tooltipItems) {
                                    const item = tooltipItems[0];
                                    return `Station: ${formatStation(item.parsed.x)}`;
                                },
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    const value = context.parsed.y;
                                    
                                    // Check if this is any kind of percentage change dataset (using the y1 axis)
                                    if (context.dataset.yAxisID === 'y1') {
                                        return `${label}: ${value.toFixed(3)}%`;
                                    }
                                    
                                    // For all other datasets (main data on y axis)
                                    return `${label}: ${value.toFixed(2)} dBmA`;
                                }
                            }
                        },
                        annotation: {
                            annotations: {}
                        },
                        zoom: {
                            limits: {
                                y: {min: 'original', max: 'original'},
                                y1: {min: 0} // Ensure Y1 axis never goes below 0
                            },
                            zoom: {
                                wheel: {
                                    enabled: true,  // Enable zooming with mouse wheel
                                },
                                mode: 'xy',  // Allow zooming on both axes
                                onZoom: function({ chart }) {
                                    const y1Scale = chart.scales.y1;
                                    if (y1Scale.min < 0) {
                                        y1Scale.min = 0; // Prevent the Y1 axis from moving downward
                                        chart.update();
                                    }
                                }
                            },
                            pan: {
                                enabled: true,
                                mode: 'xy'  // Allow panning on both axes
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            title: {
                                display: true,
                                text: 'Station',
                                color: '#fff',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#fff',
                                callback: function(value) {
                                    return formatStation(value);
                                }
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Current (dBmA)',
                                color: '#fff',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#fff'
                            }
                        },
                        y1: {
                            type: 'linear',
                            position: 'right',
                            title: {
                                display: true,
                                text: '% Current Change/100 ft',
                                color: 'rgb(255, 165, 0)',
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                }
                            },
                            grid: {
                                drawOnChartArea: false // Only show grid lines for the left y-axis
                            },
                            ticks: {
                                color: 'rgb(255, 165, 0)',
                                callback: function(value) {
                                    // The value is already in decimal form (e.g., 0.001 for 0.001%)
                                    // Just format it with 3 decimal places and add % sign
                                    return (value * 100).toFixed(3) + '%';
                                },
                                // Ensure we have approximately 10 ticks for good detail
                                count: 11,
                                precision: 4, // Higher precision for small values
                                stepSize: 0.0001 // Use 0.0001 increments (which will display as 0.001%)
                            },
                            min: 0, // Keeps the bottom of Y1 axis fixed at 0
                            // We'll dynamically adjust the max based on data in resetAxisZoom
                            suggestedMax: 0.01, // Start with a higher default max (1%) for better visibility
                            beginAtZero: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating new chart:', error);
            showMessage('Error creating chart: ' + error.message, 'error');
            return;
        }
        
        // Reset axis zoom to ensure proper Y1 axis range
        resetAxisZoom();
    }
    
    // Add selected points as a separate dataset if any are selected
    updateSelectionDisplay();
    
    // Always reset axis zoom to ensure proper Y1 axis range
    // This makes the "Fit to Screen" behavior automatic
    resetAxisZoom();
    
    // We've moved the zoom state saving to the specific functions that modify zoom
}

/**
 * Formats a station number to the 00+00 format
 * @param {number} station - The station number to format
 * @returns {string} - Formatted station string
 */
function formatStation(station) {
    if (isNaN(station)) return '';
    
    // Split the station into whole and decimal parts
    const wholePart = Math.floor(station / 100);
    const decimalPart = Math.round(station % 100);
    
    // Format as 00+00
    return `${wholePart}+${decimalPart.toString().padStart(2, '0')}`;
}

/**
 * Updates the output display with data statistics
 * @param {Array} data - The data to display statistics for
 */
function updateOutputDisplay(data) {
    // Calculate statistics
    const totalPoints = data.length;
    
    const selectedCount = selectedDataPoints.length;
    const selectedPercentage = selectedCount > 0 ? ((selectedCount / totalPoints) * 100).toFixed(2) : 0;
    
    // Get the stats container
    const statsGrid = document.querySelector('.stats-grid');
    if (!statsGrid) return;
    
    // Clear previous stats
    statsGrid.innerHTML = '';
    
    // Create stat boxes
    const statBoxes = [
        {
            label: 'Total Data Points',
            value: totalPoints
        }
    ];
    
    // Add POINTTYPE stats
    const pointTypes = {};
    data.forEach(point => {
        if (point.pointtype) {
            const type = point.pointtype.toUpperCase();
            pointTypes[type] = (pointTypes[type] || 0) + 1;
        }
    });
    
    // Add each point type to the stats
    Object.keys(pointTypes).forEach(type => {
        const count = pointTypes[type];
        const percentage = ((count / totalPoints) * 100).toFixed(1);
        statBoxes.push({
            label: `${type} Points`,
            value: count,
            subtext: `${percentage}% of total`
        });
    });
    
    // Add selection stats if points are selected
    if (selectedCount > 0) {
        statBoxes.push(
            {
                label: 'Selected Points',
                value: selectedCount,
                subtext: `${selectedPercentage}% of total`
            }
        );
    }
    
    // Add custom group stats
    const ridGroups = currentRID 
        ? customGroups.filter(group => group.rid === currentRID)
        : [];
        
    if (ridGroups.length > 0) {
        // Add a section for custom groups
        const groupsSection = document.createElement('div');
        groupsSection.className = 'custom-groups-summary';
        groupsSection.innerHTML = '<h3>Custom Groups</h3>';
        statsGrid.appendChild(groupsSection);
        
        // Add stats for each group
        ridGroups.forEach(group => {
            // Create a stat box for this group, regardless of point count
            const groupBox = document.createElement('div');
            groupBox.className = 'stat-box';
            groupBox.style.borderColor = group.color;
            
            let avgPercentChangeText = '';
            
            // Only calculate percentage changes if we have at least 2 points
            if (group.points.length >= 2) {
                // Calculate percentage changes for this group
                const groupPercentageChanges = calculatePercentageChange(group.points, group);
                
                // Calculate average percentage change
                const avgPercentChange = groupPercentageChanges.length > 0 
                    ? groupPercentageChanges.reduce((sum, item) => sum + item.percentChange, 0) / groupPercentageChanges.length 
                    : 0;
                
                avgPercentChangeText = `Avg % Change: ${avgPercentChange.toFixed(3)}%`;
            } else {
                avgPercentChangeText = 'Not enough points for % change';
            }
            
            groupBox.innerHTML = `
                <div class="stat-label">${group.name}</div>
                <div class="stat-value">${group.points.length} points</div>
                <div class="stat-subtext">${avgPercentChangeText}</div>
            `;
            
            statsGrid.appendChild(groupBox);
        });
    }
    
    // Add stat boxes to the grid
    statBoxes.forEach(stat => {
        const box = document.createElement('div');
        box.className = 'stat-box';
        
        box.innerHTML = `
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value">${stat.value}</div>
            ${stat.subtext ? `<div class="stat-subtext">${stat.subtext}</div>` : ''}
        `;
        
        statsGrid.appendChild(box);
    });
    
    // Update selection details if points are selected
    updateSelectionDetails();
}

/**
 * Updates the chart to display selected points
 */
function updateSelectionDisplay() {
    if (!chart) return;
    
    // If there are no selected points, just update the chart datasets
    if (selectedDataPoints.length === 0) {
        // Remove the selection dataset if it exists
        chart.data.datasets = chart.data.datasets.filter(dataset => dataset.label !== 'Selected Points');
        chart.update();
        return;
    }
    
    console.log(`Updating selection display with ${selectedDataPoints.length} selected points`);
    
    // Calculate selection statistics
    const minStation = Math.min(...selectedDataPoints.map(p => p.station));
    const maxStation = Math.max(...selectedDataPoints.map(p => p.station));
    
    // Determine which parameter to use for the y-axis (prefer current if available)
    const displayParameter = selectedDataPoints.some(point => point.current !== undefined) ? 'current' : activeParameter;
    
    // Calculate average using the display parameter
    const avgValue = selectedDataPoints.reduce((sum, p) => {
        const value = p[displayParameter] !== undefined ? p[displayParameter] : p[activeParameter];
        return sum + value;
    }, 0) / selectedDataPoints.length;
    
    // Find the selection dataset if it exists
    let selectionDatasetIndex = chart.data.datasets.findIndex(dataset => dataset.label === 'Selected Points');
    
    // Create the selection dataset
    const selectionDataset = {
        label: 'Selected Points',
        data: selectedDataPoints.map(item => ({ 
            x: item.station, 
            y: item.current !== undefined ? item.current : item[activeParameter] 
        })),
        backgroundColor: 'rgba(255, 0, 0, 0.7)', // Red
        borderColor: 'rgb(255, 0, 0)',
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        type: 'scatter',
        yAxisID: 'y',
        order: 0 // Draw on top
    };
    
    // Update or add the selection dataset
    if (selectionDatasetIndex !== -1) {
        chart.data.datasets[selectionDatasetIndex] = selectionDataset;
    } else {
        chart.data.datasets.push(selectionDataset);
    }
    
    // Update the chart
    chart.update();
    
    // Update the output display with the new selection
    // Use filteredData if available, otherwise use parsedData
    const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
    
    // Update selection details
    updateSelectionDetails();
    
    // Show success message for better user feedback
    showMessage(`Selected ${selectedDataPoints.length} points from station ${formatStation(minStation)} to ${formatStation(maxStation)}.`, 'success');
}

/**
 * Handles parameter change (disabled since we're using a fixed parameter)
 */
function handleParameterChange() {
    // Fixed to use 'signal' parameter
    activeParameter = 'signal';
    
    if (parsedData.length > 0) {
        processAndDisplayData();
    }
}

/**
 * Clears the current selection
 */
function clearSelection() {
    selectedDataPoints = [];
    
    // Disable and reset grouping controls
    if (groupNameInput) {
        groupNameInput.disabled = true;
        groupNameInput.value = '';
    }
    if (applyGroupBtn) applyGroupBtn.disabled = true;
    
    // Refresh the display using safe update
    if (chart) {
        safeChartUpdate();
    } else {
        const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
        updateOutputDisplay(dataToUse);
    }
    
    // Clear selection rectangle if it exists
    if (selectedArea) {
        selectedArea.remove();
        selectedArea = null;
    }
    
    showMessage('Selection cleared.', 'success');
}

/**
 * Handles downloading data in various formats
 * @param {string} format - The format to download in (csv, excel, json, summary, pdf)
 */
function handleDownloadData(format = 'csv') {
    if (parsedData.length === 0) {
        showMessage('No data to download. Please upload a file first.', 'error');
        return;
    }
    
    try {
        // Calculate percentage changes for all data
        const percentageChanges = calculatePercentageChange(parsedData);
        
        // Create a map of station to percentage change for easy lookup
        const percentageChangeMap = {};
        const actualPercentageChangeMap = {};
        percentageChanges.forEach(item => {
            percentageChangeMap[item.station] = item.percentChange;
            actualPercentageChangeMap[item.station] = item.actualPercentChange || item.percentChange;
        });
        
        // Calculate percentage changes for each custom group
        const groupPercentageChangeMaps = {};
        const groupMembership = {}; // Track which group each point belongs to
        
        // Calculate percentage changes for all groups regardless of RID
        customGroups.forEach(group => {
            // Store each point's group membership regardless of count
            group.points.forEach(point => {
                groupMembership[point.station] = {
                    groupId: group.id,
                    groupName: group.name
                };
            });
            
            // Only calculate percentage changes if we have enough points
            if (group.points.length >= 2) {
                const groupChanges = calculatePercentageChange(group.points, group);
                
                // Create maps for this group
                if (!groupPercentageChangeMaps[group.id]) {
                    groupPercentageChangeMaps[group.id] = {};
                }
                
                // Store percentage changes by station
                groupChanges.forEach(item => {
                    groupPercentageChangeMaps[group.id][item.station] = {
                        percentChange: item.percentChange,
                        actualPercentChange: item.actualPercentChange || item.percentChange,
                        groupName: group.name
                    };
                });
            }
        });
        
        // Identify group transitions to calculate between-group changes
        const betweenGroupChanges = calculateBetweenGroupChanges();
        
        // Prepare data for export - include original data fields plus our calculated values
        const exportData = parsedData.map(item => {
            // Start with a copy of all original data fields - this preserves ALL original data
            const exportItem = { ...item };
            
            // Check if point is in a custom group using the groupMembership map
            let customGroupName = '';
            let customGroupId = null;
            
            if (groupMembership[item.station]) {
                customGroupName = groupMembership[item.station].groupName;
                customGroupId = groupMembership[item.station].groupId;
            }
            
            // Remove only UI-specific fields, keep all data fields
            delete exportItem.above_threshold;
            delete exportItem.group_category;
            delete exportItem.selected;
            delete exportItem.color;
            
            // Add the essential analysis fields
            exportItem.group = customGroupName || '';
            exportItem['% Current Change/100 ft'] = percentageChangeMap[item.station] !== undefined ? 
                percentageChangeMap[item.station].toFixed(3) + '%' : '';
            exportItem['Actual % Current Change/100 ft'] = actualPercentageChangeMap[item.station] !== undefined ? 
                actualPercentageChangeMap[item.station].toFixed(3) + '%' : '';
            
            // Add group-specific percentage change if available
            if (customGroupId && groupPercentageChangeMaps[customGroupId] && 
                groupPercentageChangeMaps[customGroupId][item.station]) {
                const groupChange = groupPercentageChangeMaps[customGroupId][item.station];
                exportItem['Group % Change/100 ft'] = groupChange.percentChange.toFixed(3) + '%';
                exportItem['Group Actual % Change/100 ft'] = groupChange.actualPercentChange.toFixed(3) + '%';
            } else {
                exportItem['Group % Change/100 ft'] = '';
                exportItem['Group Actual % Change/100 ft'] = '';
            }
            
            // Add between-group transition calculations if this is the last point of a group
            // before another group starts
            if (betweenGroupChanges[item.station]) {
                const transition = betweenGroupChanges[item.station];
                exportItem['Next Group'] = transition.nextGroupName;
                exportItem['Between Groups % Change/100 ft'] = transition.percentChange.toFixed(3) + '%';
                exportItem['Between Groups Actual % Change/100 ft'] = transition.actualPercentChange.toFixed(3) + '%';
            } else {
                exportItem['Next Group'] = '';
                exportItem['Between Groups % Change/100 ft'] = '';
                exportItem['Between Groups Actual % Change/100 ft'] = '';
            }
            
            // Ensure current field is included (convert from item.current property)
            if (item.current !== undefined) {
                // Store as a number, not a string, so it's properly formatted in Excel
                exportItem['Current (dBmA)'] = Number(item.current);
            } else {
                exportItem['Current (dBmA)'] = '';
            }
            
            // Ensure SIGNAL field is preserved even if blank
            if ('signal' in item) {
                exportItem.signal = item.signal;
            }
            
            // Ensure pointtype is preserved
            if ('pointtype' in item) {
                exportItem.pointtype = item.pointtype;
            }
            
            return exportItem;
        });
        
        // Download in the selected format
        switch (format.toLowerCase()) {
            case 'csv':
                downloadCSV(exportData);
                break;
            case 'excel':
                downloadExcel(exportData);
                break;
            case 'json':
                downloadJSON(exportData);
                break;
            case 'pdf':
                // For PDF, we need to pass the data and chart
                generatePDFReport(exportData);
                break;
            default:
                downloadCSV(exportData);
        }
    } catch (error) {
        console.error('Error preparing data for download:', error);
        showMessage(`Error preparing data for download: ${error.message}`, 'error');
    }
}

/**
 * Downloads data as CSV file
 * @param {Array} data - The data to download
 */
function downloadCSV(data) {
    try {
        // Get all unique keys from the data objects
        const keys = new Set();
        data.forEach(item => {
            Object.keys(item).forEach(key => keys.add(key));
        });
        const headers = Array.from(keys);
        
        // Create CSV header row
        let csvContent = headers.join(',') + '\n';
        
        // Add data rows
        data.forEach(item => {
            const row = headers.map(header => {
                // Get the value or empty string if not present
                const value = item[header] !== undefined ? item[header] : '';
                
                // Handle values with commas, quotes, or newlines by wrapping in quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    // Escape any quotes by doubling them
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',');
            
            csvContent += row + '\n';
        });
        
        // Create a Blob with the CSV content
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // Create a download link and trigger the download
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'pcm_data_export.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Data exported successfully in CSV format.', 'success');
    } catch (error) {
        console.error('Error generating CSV:', error);
        showMessage(`Error generating CSV: ${error.message}`, 'error');
    }
}

/**
 * Downloads data as Excel file
 * @param {Array} data - The data to download
 */
function downloadExcel(data) {
    try {
        // Create a new workbook
        const wb = XLSX.utils.book_new();
        
        // Ensure data is properly formatted
        const formattedData = data.map(item => {
            const formattedItem = {};
            // Iterate through all properties to ensure they're properly formatted
            for (const key in item) {
                // Keep all original data fields, even if blank
                if (typeof item[key] === 'number') {
                    // Keep numeric values as numbers for proper Excel formatting
                    formattedItem[key] = item[key];
                } else if (item[key] === undefined || item[key] === null) {
                    // Preserve empty fields as empty strings
                    formattedItem[key] = '';
                } else {
                    // Keep all other values as is
                    formattedItem[key] = item[key];
                }
            }
            return formattedItem;
        });
        
        // Convert data to worksheet
        const ws = XLSX.utils.json_to_sheet(formattedData);
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "PCM Data");
        
        // Generate Excel file and trigger download
        XLSX.writeFile(wb, "pcm_data_export.xlsx");
        
        showMessage('Data exported successfully in Excel format.', 'success');
    } catch (error) {
        console.error('Error generating Excel file:', error);
        showMessage(`Error generating Excel file: ${error.message}`, 'error');
    }
}

/**
 * Downloads data as JSON file
 * @param {Array} data - The data to download
 */
function downloadJSON(data) {
    try {
        // Convert data to JSON string with pretty formatting
        const jsonString = JSON.stringify(data, null, 2);
        
        // Create a Blob with the JSON content
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // Create a download link and trigger the download
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'pcm_data_export.json');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('Data exported successfully in JSON format.', 'success');
    } catch (error) {
        console.error('Error generating JSON:', error);
        showMessage(`Error generating JSON: ${error.message}`, 'error');
    }
}

/**
 * Generates a PDF report with data visualization and analysis
 * @param {Array} data - The data to include in the report
 * @param {Array} aboveThreshold - Data points above threshold
 * @param {Array} belowThreshold - Data points below threshold
 */
function generatePDFReport(data, aboveThreshold, belowThreshold) {
    try {
        // Capture chart image first
        captureChartImage().then(chartImage => {
            // Then capture map image
            captureMapImage().then(mapImage => {
                // Create PDF document
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });
                
                // Add title
                doc.setFontSize(18);
                doc.setTextColor(0, 51, 102);
                doc.text('PCM Data Analysis Report', 105, 15, { align: 'center' });
                
                // Add date
                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                const today = new Date();
                doc.text(`Generated on: ${today.toLocaleDateString()} ${today.toLocaleTimeString()}`, 105, 22, { align: 'center' });
                
                // Add chart image
                if (chartImage) {
                    doc.addImage(chartImage, 'PNG', 15, 30, 180, 80);
                    doc.setFontSize(12);
                    doc.setTextColor(0, 0, 0);
                    doc.text('Figure 1: PCM Data Visualization', 105, 115, { align: 'center' });
                }
                
                // Add map image if available
                let yPos = 120;
                if (mapImage) {
                    doc.addImage(mapImage, 'PNG', 15, yPos, 180, 80);
                    yPos += 85;
                    doc.setFontSize(12);
                    doc.text('Figure 2: Geographic Distribution', 105, yPos, { align: 'center' });
                    yPos += 10;
                }
                
                // Add data summary
                doc.setFontSize(14);
                doc.setTextColor(0, 51, 102);
                yPos += 5;
                doc.text('Data Summary', 15, yPos);
                yPos += 8;
                
                // Add summary table
                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
                
                // Calculate statistics
                const totalPoints = data.length;
                const groupACount = aboveThreshold.length;
                const groupBCount = belowThreshold.length;
                const groupAPercentage = ((groupACount / totalPoints) * 100).toFixed(1);
                const groupBPercentage = ((groupBCount / totalPoints) * 100).toFixed(1);
                
                // Count points with current values
                const pointsWithCurrent = data.filter(point => point['Current (dBmA)'] !== undefined).length;
                const pointsWithCurrentPercentage = ((pointsWithCurrent / totalPoints) * 100).toFixed(1);
                
                // Count points with percentage change values
                const pointsWithPercentChange = data.filter(point => point.percent_change_per_100ft !== '').length;
                const pointsWithPercentChangePercentage = ((pointsWithPercentChange / totalPoints) * 100).toFixed(1);
                
                // Count points in custom groups
                const pointsInGroups = data.filter(point => point.group !== '').length;
                const pointsInGroupsPercentage = ((pointsInGroups / totalPoints) * 100).toFixed(1);
                
                // Create summary table
                const summaryData = [
                    ['Total Data Points', totalPoints.toString()],
                    ['Points Above Threshold', `${groupACount} (${groupAPercentage}%)`],
                    ['Points Below Threshold', `${groupBCount} (${groupBPercentage}%)`],
                    ['Points with Current (dBmA)', `${pointsWithCurrent} (${pointsWithCurrentPercentage}%)`],
                    ['Points with % Change Values', `${pointsWithPercentChange} (${pointsWithPercentChangePercentage}%)`],
                    ['Points in Custom Groups', `${pointsInGroups} (${pointsInGroupsPercentage}%)`]
                ];
                
                doc.autoTable({
                    startY: yPos,
                    head: [['Metric', 'Value']],
                    body: summaryData,
                    theme: 'grid',
                    headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255] },
                    margin: { left: 15, right: 15 },
                    styles: { overflow: 'linebreak' },
                    columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 } }
                });
                
                yPos = doc.lastAutoTable.finalY + 10;
                
                // Add custom groups summary if any exist
                const uniqueGroups = [...new Set(data.filter(item => item.group !== '').map(item => item.group))];
                
                if (uniqueGroups.length > 0) {
                    // Add new page if needed
                    if (yPos > 240) {
                        doc.addPage();
                        yPos = 20;
                    }
                    
                    doc.setFontSize(14);
                    doc.setTextColor(0, 51, 102);
                    doc.text('Custom Groups', 15, yPos);
                    yPos += 8;
                    
                    // Create groups table data
                    const groupsTableData = uniqueGroups.map(groupName => {
                        const groupPoints = data.filter(point => point.group === groupName);
                        return [
                            groupName,
                            groupPoints.length.toString(),
                            ((groupPoints.length / totalPoints) * 100).toFixed(1) + '%'
                        ];
                    });
                    
                    doc.autoTable({
                        startY: yPos,
                        head: [['Group Name', 'Points Count', '% of Total']],
                        body: groupsTableData,
                        theme: 'grid',
                        headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255] },
                        margin: { left: 15, right: 15 },
                        styles: { overflow: 'linebreak' }
                    });
                    
                    yPos = doc.lastAutoTable.finalY + 10;
                }
                
                // Add data sample (first 10 rows)
                if (data.length > 0) {
                    // Add new page
                    doc.addPage();
                    
                    doc.setFontSize(14);
                    doc.setTextColor(0, 51, 102);
                    doc.text('Data Sample', 15, 20);
                    
                    // Get key columns for the sample
                    const sampleData = data.slice(0, 10).map(item => {
                        return {
                            'Station': item.station,
                            'Signal (mA)': item.signal,
                            'Current (dBmA)': item['Current (dBmA)'] || '',
                            '% Change/100ft': item['% Current Change/100 ft'] || '',
                            'Group': item.group || ''
                        };
                    });
                    
                    // Create table headers from the first item's keys
                    const headers = Object.keys(sampleData[0]);
                    
                    // Create table body
                    const tableBody = sampleData.map(item => {
                        return headers.map(header => item[header] !== undefined ? item[header].toString() : '');
                    });
                    
                    doc.autoTable({
                        startY: 28,
                        head: [headers],
                        body: tableBody,
                        theme: 'grid',
                        headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255] },
                        margin: { left: 15, right: 15 },
                        styles: { overflow: 'linebreak', cellPadding: 2 },
                        columnStyles: { 0: { cellWidth: 25 } }
                    });
                }
                
                // Add notes section
                const reportNotes = document.getElementById('report-notes');
                if (reportNotes && reportNotes.value.trim()) {
                    // Add new page if needed
                    if (doc.lastAutoTable.finalY > 240) {
                        doc.addPage();
                        yPos = 20;
                    } else {
                        yPos = doc.lastAutoTable.finalY + 15;
                    }
                    
                    doc.setFontSize(14);
                    doc.setTextColor(0, 51, 102);
                    doc.text('Notes', 15, yPos);
                    yPos += 8;
                    
                    doc.setFontSize(10);
                    doc.setTextColor(0, 0, 0);
                    
                    // Split notes into lines to fit the page width
                    const textLines = doc.splitTextToSize(reportNotes.value, 180);
                    doc.text(textLines, 15, yPos);
                }
                
                // Add footer with page numbers
                const pageCount = doc.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(8);
                    doc.setTextColor(100, 100, 100);
                    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
                    doc.text('PCM Data Grouping Tool', 15, 290);
                    doc.text(today.toLocaleDateString(), 195, 290, { align: 'right' });
                }
                
                // Save the PDF
                doc.save('pcm_data_report.pdf');
                
                showMessage('PDF report generated successfully.', 'success');
            }).catch(error => {
                console.error('Error capturing map image:', error);
                showMessage('Error generating PDF report: Could not capture map image.', 'error');
            });
        }).catch(error => {
            console.error('Error capturing chart image:', error);
            showMessage('Error generating PDF report: Could not capture chart image.', 'error');
        });
    } catch (error) {
        console.error('Error generating PDF report:', error);
        showMessage(`Error generating PDF report: ${error.message}`, 'error');
    }
}

/**
 * Captures the chart as an image
 * @returns {Promise<string>} Promise resolving to chart image data URL
 */
function captureChartImage() {
    return new Promise((resolve, reject) => {
        const chartCanvas = document.getElementById('data-chart');
        if (!chartCanvas || !chart) {
            reject(new Error('Chart not initialized'));
            return;
        }
        
        try {
            // Save current chart state
            const originalAnimation = chart.options.animation;
            
            // Temporarily disable animations for clean capture
            chart.options.animation = false;
            
            // Ensure axis labels are visible
            chart.options.scales.x.title.display = true;
            chart.options.scales.x.title.color = '#000';
            chart.options.scales.x.title.font = {
                size: 16,
                weight: 'bold'
            };
            
            chart.options.scales.y.title.display = true;
            chart.options.scales.y.title.color = '#000';
            chart.options.scales.y.title.font = {
                size: 16,
                weight: 'bold'
            };
            
            // Update chart with print-friendly colors
            chart.options.scales.x.grid.color = 'rgba(0, 0, 0, 0.1)';
            chart.options.scales.y.grid.color = 'rgba(0, 0, 0, 0.1)';
            chart.options.scales.x.ticks.color = '#000';
            chart.options.scales.y.ticks.color = '#000';
            
            // Update legend for print
            chart.options.plugins.legend.labels.color = '#000';
            
            // Apply changes
            chart.update();
            
            // Capture the chart
            const chartImage = chartCanvas.toDataURL('image/png');
            
            // Restore original settings
            chart.options.animation = originalAnimation;
            chart.options.scales.x.title.color = '#fff';
            chart.options.scales.y.title.color = '#fff';
            chart.options.scales.x.grid.color = 'rgba(255, 255, 255, 0.2)';
            chart.options.scales.y.grid.color = 'rgba(255, 255, 255, 0.2)';
            chart.options.scales.x.ticks.color = '#fff';
            chart.options.scales.y.ticks.color = '#fff';
            chart.options.plugins.legend.labels.color = '#fff';
            
            // Apply restoration
            chart.update();
            
            resolve(chartImage);
        } catch (error) {
            console.error('Error capturing chart image:', error);
            reject(error);
        }
    });
}

/**
 * Captures an image of the map with data points
 * @returns {Promise<string>} - Promise that resolves with the map image
 */
function captureMapImage() {
    return new Promise((resolve, reject) => {
        if (!map) {
            reject(new Error('Map not initialized'));
            return;
        }
        
        let tempMapContainer;
        
        try {
            // Create a temporary container for the map capture
            tempMapContainer = document.createElement('div');
            tempMapContainer.id = 'temp-map-container-' + Date.now();
            tempMapContainer.style.width = '800px';
            tempMapContainer.style.height = '500px';
            tempMapContainer.style.position = 'absolute';
            tempMapContainer.style.left = '-9999px';
            document.body.appendChild(tempMapContainer);
            
            // Create a temporary map for the capture
            const tempMap = L.map(tempMapContainer, {
                center: map.getCenter(),
                zoom: map.getZoom(),
                zoomControl: false,
                attributionControl: false
            });
            
            // Get the current active base layer
            let activeBaseLayer = null;
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) {
                    activeBaseLayer = layer;
                }
            });
            
            // Add the same tile layer to the temp map
            if (activeBaseLayer) {
                const tileUrl = activeBaseLayer._url;
                const tileOptions = { ...activeBaseLayer.options };
                L.tileLayer(tileUrl, tileOptions).addTo(tempMap);
            } else {
                // Fallback to OpenStreetMap if no active layer detected
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19
                }).addTo(tempMap);
            }
            
            // Use the appropriate data source
            const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
            
            // Helper function to add a marker with coordinates
            const addMarker = (point, options) => {
                let lat, lng;
                
                if (point.latitude !== undefined && point.longitude !== undefined) {
                    lat = point.latitude;
                    lng = point.longitude;
                } else if (point.y !== undefined && point.x !== undefined) {
                    lat = point.y;
                    lng = point.x;
                } else {
                    return; // Skip points without coordinates
                }
                
                // Create marker based on pointtype
                let marker;
                
                if (point.pointtype) {
                    if (point.pointtype.toUpperCase() === 'POINT GENERIC') {
                        // Use a square marker for Point Generic
                        const squareIcon = L.divIcon({
                            className: 'custom-marker square-marker',
                            html: `<div style="width: 12px; height: 12px; background-color: rgb(255, 165, 0); border: 1px solid #000;"></div>`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });
                        
                        marker = L.marker([lat, lng], {
                            icon: squareIcon
                        });
                    } 
                    else if (point.pointtype.toUpperCase() === 'SETUP LOCATION') {
                        // Use a triangle marker for Setup Location
                        const triangleIcon = L.divIcon({
                            className: 'custom-marker triangle-marker',
                            html: `<div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 12px solid rgb(0, 128, 0); border-top: none;"></div>`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });
                        
                        marker = L.marker([lat, lng], {
                            icon: triangleIcon
                        });
                    }
                    else {
                        // Default circle marker for SIGNAL and other types
                        marker = L.circleMarker([lat, lng], {
                            radius: 6,
                            fillColor: 'rgb(0, 123, 255)', // Blue for SIGNAL
                            color: '#000',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        });
                    }
                }
                else {
                    // Default circle marker for points without a pointtype
                    marker = L.circleMarker([lat, lng], {
                        radius: 6,
                        fillColor: 'rgb(0, 123, 255)',
                        color: '#000',
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.8
                    });
                }
                
                // Add popup with information
                marker.bindPopup(`
                    <strong>Station:</strong> ${formatStation(point.station)}<br>
                    ${point[activeParameter] !== undefined ? 
                        `<strong>${activeParameter}:</strong> ${point[activeParameter].toFixed(2)} dBmA<br>` : ''}
                    <strong>Coordinates:</strong> (${lat.toFixed(6)}, ${lng.toFixed(6)})
                    ${point.pointtype ? `<br><strong>Point Type:</strong> ${point.pointtype}` : ''}
                `);
                
                marker.addTo(map);
                mapMarkers.push(marker);
            };
            
            // Add all data points with default color
            dataToUse.forEach(point => {
                addMarker(point, {
                    radius: 6,
                    fillColor: 'rgb(0, 123, 255)', // Use a single color for all points - updated to match chart line color
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            });
            
            // Add custom group points with their respective colors
            const ridGroups = currentRID 
                ? customGroups.filter(group => group.rid === currentRID && group.visible)
                : [];
                
            ridGroups.forEach(group => {
                group.points.forEach(point => {
                    addMarker(point, {
                        radius: 6,
                        fillColor: group.color,
                        color: '#000',
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.8
                    });
                });
            });
            
            // Add selected points
            selectedDataPoints.forEach(point => {
                addMarker(point, {
                    radius: 6,
                    fillColor: 'rgb(255, 99, 132)',
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            });
            
            // Fit bounds to all points
            const allPoints = [...dataToUse, ...selectedDataPoints];
            const bounds = [];
            
            allPoints.forEach(point => {
                if (point.latitude !== undefined && point.longitude !== undefined) {
                    bounds.push([point.latitude, point.longitude]);
                } else if (point.y !== undefined && point.x !== undefined) {
                    bounds.push([point.y, point.x]);
                }
            });
            
            if (bounds.length > 0) {
                tempMap.fitBounds(bounds);
            }
            
            // Wait for tiles to load
            setTimeout(() => {
                // Use html2canvas to capture the map
                html2canvas(tempMapContainer).then(canvas => {
                    const dataUrl = canvas.toDataURL('image/png');
                    document.body.removeChild(tempMapContainer);
                    resolve(dataUrl);
                }).catch(error => {
                    console.error('Error capturing map:', error);
                    if (document.body.contains(tempMapContainer)) {
                        document.body.removeChild(tempMapContainer);
                    }
                    reject(error);
                });
            }, 1000);
        } catch (error) {
            console.error('Error setting up map capture:', error);
            if (tempMapContainer && document.body.contains(tempMapContainer)) {
                document.body.removeChild(tempMapContainer);
            }
            reject(error);
        }
    });
}

/**
 * Adds markers to the map for the given points
 * @param {Array} points - The points to add markers for
 * @param {string} color - The color for the markers
 * @param {string} label - The label for the markers
 */
function addMarkersToMap(points, color, label) {
    if (!map) return;
    
    points.forEach(point => {
        // Check for latitude/longitude or x/y coordinates
        let lat, lng;
        
        if (point.latitude !== undefined && point.longitude !== undefined) {
            lat = point.latitude;
            lng = point.longitude;
        } else if (point.y !== undefined && point.x !== undefined) {
            // Use y as latitude and x as longitude
            lat = point.y;
            lng = point.x;
        } else {
            // Skip points without coordinates
            return;
        }
        
        let marker;
        
        // Create appropriate marker based on pointtype
        if (point.pointtype) {
            if (point.pointtype.toUpperCase() === 'POINT GENERIC') {
                // Use a square marker for Point Generic, but with the group color
                const squareIcon = L.divIcon({
                    className: 'custom-marker square-marker',
                    html: `<div style="width: 12px; height: 12px; background-color: ${color}; border: 1px solid #000;"></div>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                
                marker = L.marker([lat, lng], {
                    icon: squareIcon
                });
            } 
            else if (point.pointtype.toUpperCase() === 'SETUP LOCATION') {
                // Use a triangle marker for Setup Location, but with the group color
                const triangleIcon = L.divIcon({
                    className: 'custom-marker triangle-marker',
                    html: `<div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 12px solid ${color}; border-top: none;"></div>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                
                marker = L.marker([lat, lng], {
                    icon: triangleIcon
                });
            }
            else {
                // Default circle marker for SIGNAL and other types, with the group color
                marker = L.circleMarker([lat, lng], {
                    radius: 6,
                    fillColor: color,
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            }
        }
        else {
            // Default circle marker for points without a pointtype
            marker = L.circleMarker([lat, lng], {
                radius: 6,
                fillColor: color,
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });
        }
        
        // Add popup with information
        marker.bindPopup(`
            <strong>Station:</strong> ${formatStation(point.station)}<br>
            ${point[activeParameter] !== undefined ? 
                `<strong>${activeParameter}:</strong> ${point[activeParameter].toFixed(2)} dBmA<br>` : ''}
            <strong>Coordinates:</strong> (${lat.toFixed(6)}, ${lng.toFixed(6)})<br>
            <strong>Group:</strong> ${label}
            ${point.pointtype ? `<br><strong>Point Type:</strong> ${point.pointtype}` : ''}
        `);
        
        marker.addTo(map);
        mapMarkers.push(marker);
    });
}

/**
 * Clears all markers from the map
 */
function clearMapMarkers() {
    if (!map) return;
    
    mapMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    
    mapMarkers = [];
}

/**
 * Handles applying a custom group to selected data points
 */
function handleApplyCustomGroup() {
    if (selectedDataPoints.length === 0) {
        showMessage('Please select data points first.', 'error');
        return;
    }
    
    // Ensure we have a current RID
    if (!currentRID) {
        showMessage('Please select a data set (RID) first.', 'error');
        return;
    }
    
    // Get the next group number for default naming
    const nextGroupNumber = customGroups.filter(g => g.rid === currentRID).length + 1;
    
    // Use the input value or default to "Group X"
    const groupName = groupNameInput.value.trim() || `Group ${nextGroupNumber}`;
    
    // Check if any selected points are already in a group
    const pointsAlreadyInGroups = [];
    const pointsToAdd = [];
    
    selectedDataPoints.forEach(point => {
        let isInGroup = false;
        
        // Check if this point is already in any group
        for (const group of customGroups) {
            if (group.rid === currentRID && 
                group.points.some(p => p.station === point.station)) {
                pointsAlreadyInGroups.push(point);
                isInGroup = true;
                break;
            }
        }
        
        if (!isInGroup) {
            pointsToAdd.push(point);
        }
    });
    
    // If all points are already in groups, show error message
    if (pointsToAdd.length === 0) {
        showMessage('All selected points are already in groups. Please select different points.', 'error');
        return;
    }
    
    // If some points are already in groups, show warning message
    if (pointsAlreadyInGroups.length > 0) {
        showMessage(`${pointsAlreadyInGroups.length} points are already in groups and will be skipped.`, 'warning');
    }
    
    // Create a new group with only the points that aren't already in groups
    const newGroup = {
        id: Date.now(), // Unique ID
        name: groupName, // Set the group name
        color: groupColors[customGroups.filter(g => g.rid === currentRID).length % groupColors.length],
        points: pointsToAdd, // Only add points that aren't already in groups
        visible: true,
        rid: currentRID // Store the RID this group belongs to
    };
    
    // Add to custom groups
    customGroups.push(newGroup);
    
    // Clear selection before updating UI to ensure points show in their group color
    // instead of the selection color
    selectedDataPoints = [];
    
    // Update UI
    updateGroupToggles();
    
    // Update chart, data summary, and map
    safeChartUpdate();
    
    // Update the data summary
    const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
    updateOutputDisplay(dataToUse);
    
    // Update the map with the current data set
    updateMapWithAllData(dataToUse);
    
    // Reset and disable inputs
    groupNameInput.value = '';
    groupNameInput.disabled = true;
    applyGroupBtn.disabled = true;
    
    showMessage(`Created group "${groupName}" with ${newGroup.points.length} points.`, 'success');
}

/**
 * Updates the group toggles in the UI
 */
function updateGroupToggles() {
    if (!groupTogglesContainer) return;
    
    // Clear container
    groupTogglesContainer.innerHTML = '';
    
    // Filter groups by current RID
    const ridGroups = currentRID 
        ? customGroups.filter(group => group.rid === currentRID)
        : [];
    
    if (ridGroups.length === 0) {
        groupTogglesContainer.innerHTML = '<p class="hint-text">No groups defined yet</p>';
        return;
    }
    
    // Add toggle for each group
    ridGroups.forEach(group => {
        const toggleElement = document.createElement('div');
        toggleElement.className = 'group-toggle';
        
        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = group.visible;
        checkbox.addEventListener('change', () => {
            group.visible = checkbox.checked;
            
            // Update chart
            safeChartUpdate();
            
            // Update the data summary and map
            const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
            updateOutputDisplay(dataToUse);
            updateMapWithAllData(dataToUse);
        });
        
        // Create color indicator
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'color-indicator';
        colorIndicator.style.backgroundColor = group.color;
        
        // Create group name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-name';
        nameSpan.textContent = `${group.name} (${group.points.length})`;
        
        // Create action buttons container
        const actionButtons = document.createElement('div');
        actionButtons.className = 'group-actions';
        
        // Create edit name button
        const editNameButton = document.createElement('button');
        editNameButton.className = 'group-edit-btn';
        editNameButton.innerHTML = '<i class="fas fa-edit"></i>';
        editNameButton.title = 'Edit group name';
        editNameButton.addEventListener('click', () => {
            const newName = prompt('Enter new group name:', group.name);
            if (newName && newName.trim()) {
                group.name = newName.trim();
                updateGroupToggles();
                
                // Update chart
                safeChartUpdate();
                
                // Update the data summary and map
                const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
                updateOutputDisplay(dataToUse);
                updateMapWithAllData(dataToUse);
                
                showMessage(`Group renamed to "${newName}"`, 'success');
            }
        });
        
        // Create edit points button
        const editPointsButton = document.createElement('button');
        editPointsButton.className = 'group-edit-points-btn';
        editPointsButton.innerHTML = '<i class="fas fa-object-group"></i>';
        editPointsButton.title = 'Edit group points';
        editPointsButton.addEventListener('click', () => {
            // Confirm before editing
            if (confirm(`Edit points in group "${group.name}"? This will allow you to select new points or remove existing ones.`)) {
                // Enter edit mode for this group
                editGroupPoints(group);
            }
        });
        
        // Create delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'group-delete-btn';
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
        deleteButton.title = 'Delete group';
        deleteButton.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete the group "${group.name}"?`)) {
                // Remove the group from customGroups
                const index = customGroups.findIndex(g => g.id === group.id);
                if (index !== -1) {
                    customGroups.splice(index, 1);
                    updateGroupToggles();
                    
                    // Update chart
                    safeChartUpdate();
                    
                    // Update the data summary and map
                    const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
                    updateOutputDisplay(dataToUse);
                    updateMapWithAllData(dataToUse);
                    
                    showMessage(`Group "${group.name}" deleted`, 'success');
                }
            }
        });
        
        // Add buttons to action container
        actionButtons.appendChild(editNameButton);
        actionButtons.appendChild(editPointsButton);
        actionButtons.appendChild(deleteButton);
        
        // Add elements to toggle
        toggleElement.appendChild(checkbox);
        toggleElement.appendChild(colorIndicator);
        toggleElement.appendChild(nameSpan);
        toggleElement.appendChild(actionButtons);
        
        // Add toggle to container
        groupTogglesContainer.appendChild(toggleElement);
    });
}

/**
 * Shows a message in the message area
 * @param {string} message - The message to display
 * @param {string} type - The type of message ('error' or 'success')
 */
function showMessage(message, type) {
    if (!messageArea) {
        messageArea = document.getElementById('message-area');
        if (!messageArea) {
            console.error('Message area element not found');
            return;
        }
    }
    
    messageArea.textContent = message;
    messageArea.className = type;
    
    // Hide the message after 5 seconds
    setTimeout(() => {
        messageArea.textContent = '';
        messageArea.className = '';
    }, 5000);
}

/**
 * Updates the selection details in the output display
 */
function updateSelectionDetails() {
    if (selectedDataPoints.length === 0) return;
    
    // Find or create the selection details container
    let selectionDetails = document.querySelector('.selection-details');
    if (!selectionDetails) {
        selectionDetails = document.createElement('div');
        selectionDetails.className = 'stats-summary selection-details';
        
        const heading = document.createElement('h3');
        heading.textContent = 'Selection Details';
        selectionDetails.appendChild(heading);
        
        const detailsGrid = document.createElement('div');
        detailsGrid.className = 'stats-grid';
        selectionDetails.appendChild(detailsGrid);
        
        // Add to output data container
        const outputData = document.getElementById('output-data');
        if (outputData) {
            outputData.appendChild(selectionDetails);
        }
    }
    
    // Get the details grid
    const detailsGrid = selectionDetails.querySelector('.stats-grid');
    if (!detailsGrid) return;
    
    // Clear previous details
    detailsGrid.innerHTML = '';
    
    // Calculate selection statistics
    const minStation = Math.min(...selectedDataPoints.map(p => p.station));
    const maxStation = Math.max(...selectedDataPoints.map(p => p.station));
    
    // Determine which parameter to use for the y-axis (prefer current if available)
    const displayParameter = selectedDataPoints.some(point => point.current !== undefined) ? 'current' : activeParameter;
    
    // Calculate min and max values using the display parameter
    const minValue = Math.min(...selectedDataPoints.map(p => 
        p[displayParameter] !== undefined ? p[displayParameter] : p[activeParameter]
    ));
    const maxValue = Math.max(...selectedDataPoints.map(p => 
        p[displayParameter] !== undefined ? p[displayParameter] : p[activeParameter]
    ));
    
    // Create detail boxes
    const detailBoxes = [
        {
            label: 'Station Range',
            value: `${minStation.toFixed(2)} - ${maxStation.toFixed(2)}`
        },
        {
            label: 'Current (dBmA) Range',
            value: `${minValue.toFixed(2)} - ${maxValue.toFixed(2)}`
        }
    ];
    
    // Create and append detail boxes
    detailBoxes.forEach(detail => {
        const detailBox = document.createElement('div');
        detailBox.className = 'stat-box';
        
        const detailLabel = document.createElement('div');
        detailLabel.className = 'stat-label';
        detailLabel.textContent = detail.label;
        
        const detailValue = document.createElement('div');
        detailValue.className = 'stat-value';
        detailValue.textContent = detail.value;
        
        detailBox.appendChild(detailLabel);
        detailBox.appendChild(detailValue);
        
        detailsGrid.appendChild(detailBox);
    });
}

/**
 * Updates the map with all data points
 * @param {Array} dataSet - The data to display on the map
 */
function updateMapWithAllData(dataSet) {
    if (!map) {
        console.log('Map not initialized, cannot update');
        return;
    }
    
    // Clear existing markers
    clearMapMarkers();
    
    // Use provided data or fall back to parsedData
    const dataToMap = dataSet || parsedData;
    
    // Check if we have any geographic data
    const hasGeoData = dataToMap.some(point => 
        (point.latitude !== undefined && point.longitude !== undefined) || 
        (point.x !== undefined && point.y !== undefined)
    );
    
    console.log(`Updating map with ${dataToMap.length} data points, has geographic data: ${hasGeoData}`);
    
    if (!hasGeoData) {
        // No geographic data available
        const noGeoDataMessage = document.querySelector('.no-geo-data-message');
        if (noGeoDataMessage) {
            noGeoDataMessage.style.display = 'flex';
        }
        return;
    }
    
    // Hide the no geo data message if we have data
    const noGeoDataMessage = document.querySelector('.no-geo-data-message');
    if (noGeoDataMessage) {
        noGeoDataMessage.style.display = 'none';
    }
    
    // Count points with valid coordinates
    let validPointsCount = 0;
    const validPoints = [];
    
    // Add all data points to the map
    dataToMap.forEach(point => {
        // Check for latitude/longitude or x/y coordinates
        let lat, lng;
        
        if (point.latitude !== undefined && point.longitude !== undefined) {
            lat = point.latitude;
            lng = point.longitude;
            validPointsCount++;
            validPoints.push([lat, lng]);
        } else if (point.y !== undefined && point.x !== undefined) {
            lat = point.y;
            lng = point.x;
            validPointsCount++;
            validPoints.push([lat, lng]);
        } else {
            return; // Skip points without coordinates
        }
        
        let marker;
        
        // Create marker based on pointtype
        if (point.pointtype) {
            if (point.pointtype.toUpperCase() === 'POINT GENERIC') {
                // Square marker for Point Generic
                const squareIcon = L.divIcon({
                    className: 'custom-marker',
                    html: '<div class="square-marker"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                
                marker = L.marker([lat, lng], {
                    icon: squareIcon
                });
            } 
            else if (point.pointtype.toUpperCase() === 'SETUP LOCATION') {
                // Triangle marker for Setup Location
                const triangleIcon = L.divIcon({
                    className: 'custom-marker',
                    html: '<div class="triangle-marker"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 17]
                });
                
                marker = L.marker([lat, lng], {
                    icon: triangleIcon
                });
            }
            else {
                // Circle marker for SIGNAL points
                marker = L.circleMarker([lat, lng], {
                    radius: 7,
                    fillColor: '#2196F3',  // Blue for SIGNAL points
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            }
        }
        else {
            // Default circle marker
            marker = L.circleMarker([lat, lng], {
                radius: 7,
                fillColor: '#2196F3',
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            });
        }
        
        // Add popup with information
        marker.bindPopup(`
            <strong>Station:</strong> ${formatStation(point.station)}<br>
            ${point[activeParameter] !== undefined ? 
                `<strong>${activeParameter}:</strong> ${point[activeParameter].toFixed(2)} dBmA<br>` : ''}
            <strong>Coordinates:</strong> (${lat.toFixed(6)}, ${lng.toFixed(6)})
            ${point.pointtype ? `<br><strong>Point Type:</strong> ${point.pointtype}` : ''}
        `);
        
        marker.addTo(map);
        mapMarkers.push(marker);
    });
    
    // If we have valid points, fit the map to their bounds
    if (validPoints.length > 0) {
        try {
            map.fitBounds(validPoints);
        } catch (error) {
            console.error('Error fitting map to bounds:', error);
        }
    }
    
    // Add custom group points with their respective colors
    const ridGroups = currentRID 
        ? customGroups.filter(group => group.rid === currentRID && group.visible)
        : [];
        
    ridGroups.forEach(group => {
        addMarkersToMap(group.points, group.color, group.name);
    });
    
    // Add selected points if any
    if (selectedDataPoints.length > 0) {
        addMarkersToMap(selectedDataPoints, 'rgb(255, 99, 132)', 'Selected');
    }
}

/**
 * Handles the selection of a specific RID from the dropdown
 */
function handleRIDSelection() {
    const selectedRID = document.getElementById('rid-select').value;
    
    if (!selectedRID) {
        showMessage('Please select a valid data set', 'warning');
        return;
    }
    
    // Set the current RID
    currentRID = selectedRID;
    
    // Filter data based on selected RID
    filteredData = parsedData.filter(item => item.rid === selectedRID);
    
    console.log(`Selected RID: ${selectedRID}, found ${filteredData.length} data points`);
    
    if (filteredData.length === 0) {
        showMessage(`No data found for RID: ${selectedRID}`, 'error');
        return;
    }
    
    // Clear any previously selected data points
    selectedDataPoints = [];
    
    // Organize data parameters for the filtered data
    organizeDataParameters(filteredData);
    
    // Ensure chart is properly destroyed before processing new data
    if (chart) {
        chart.destroy();
        chart = null;
    }
    
    // Process and display the filtered data
    processAndDisplayData(filteredData);
    
    // Ensure chart event listeners are properly set up
    initializeChartPlugins();
    
    // Restore zoom state for this RID if it exists
    if (chart && zoomStates[currentRID]) {
        // Apply saved zoom state
        if (zoomStates[currentRID].y) {
            chart.options.scales.y.min = zoomStates[currentRID].y.min;
            chart.options.scales.y.max = zoomStates[currentRID].y.max;
        }
        
        if (zoomStates[currentRID].y1) {
            chart.options.scales.y1.min = Math.max(0, zoomStates[currentRID].y1.min); // Ensure min is never below 0
            chart.options.scales.y1.max = zoomStates[currentRID].y1.max;
        }
        
        // Update the chart to apply zoom state
        chart.update();
    }
    
    // Enable download button and restore points button
    const downloadButton = document.getElementById('download-btn');
    const restorePointsBtn = document.getElementById('restore-points-btn');
    const fitScreenBtn = document.getElementById('fit-screen-btn');
    if (downloadButton) downloadButton.disabled = false;
    if (restorePointsBtn) restorePointsBtn.disabled = false;
    if (fitScreenBtn) fitScreenBtn.disabled = false;
    
    // Disable group controls until a selection is made
    const groupNameInput = document.getElementById('group-name');
    const applyGroupBtn = document.getElementById('create-group-btn');
    const deleteGroupBtn = document.getElementById('delete-group-btn');
    if (groupNameInput) groupNameInput.disabled = true;
    if (applyGroupBtn) applyGroupBtn.disabled = true;
    if (deleteGroupBtn) deleteGroupBtn.disabled = true;
    
    // Update group toggles to show only groups for this RID
    updateGroupToggles();
    
    showMessage(`Data set ${selectedRID} loaded successfully`, 'success');
}

/**
 * Restores all removed points to the chart
 */
function restoreRemovedPoints() {
    if (removedPoints.length === 0) {
        showMessage('No points to restore.', 'info');
        return;
    }
    
    const count = removedPoints.length;
    removedPoints = [];
    showMessage(`Restored ${count} removed points to the chart.`, 'success');
    
    // Update the chart
    safeChartUpdate();
}

/**
 * Enters edit mode for a group's points
 * @param {Object} group - The group to edit
 */
function editGroupPoints(group) {
    // Store the current state of the group's points
    const originalPoints = [...group.points];
    
    // Create a modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    // Create modal header
    const modalHeader = document.createElement('h3');
    modalHeader.textContent = `Edit Points in Group: ${group.name}`;
    
    // Create instructions
    const modalInstructions = document.createElement('p');
    modalInstructions.innerHTML = `
        <strong>Instructions:</strong><br>
        1. Select points on the chart to add to this group<br>
        2. Hold SHIFT and select points to remove them from the selection<br>
        3. Click Save Changes when done or Cancel to revert
    `;
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.marginTop = '1.5rem';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'secondary-btn';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
        // Restore original points
        group.points = originalPoints;
        
        // Remove the modal
        document.body.removeChild(modalOverlay);
        
        // Clear selection
        selectedDataPoints = [];
        
        // Update the chart
        safeChartUpdate();
        
        showMessage('Group edit cancelled.', 'info');
    });
    
    const saveButton = document.createElement('button');
    saveButton.className = 'primary-btn';
    saveButton.textContent = 'Save Changes';
    saveButton.addEventListener('click', () => {
        // Check if any selected points are already in other groups
        const pointsAlreadyInGroups = [];
        const pointsToAdd = [];
        
        selectedDataPoints.forEach(point => {
            let isInOtherGroup = false;
            
            // Check if this point is already in any other group
            for (const otherGroup of customGroups) {
                if (otherGroup.rid === currentRID && 
                    otherGroup.id !== group.id && // Skip the current group being edited
                    otherGroup.points.some(p => p.station === point.station)) {
                    pointsAlreadyInGroups.push(point);
                    isInOtherGroup = true;
                    break;
                }
            }
            
            if (!isInOtherGroup) {
                pointsToAdd.push(point);
            }
        });
        
        // If some points are already in other groups, show warning message
        if (pointsAlreadyInGroups.length > 0) {
            showMessage(`${pointsAlreadyInGroups.length} points are already in other groups and will be skipped.`, 'warning');
        }
        
        // Update the group with the filtered selection
        group.points = pointsToAdd;
        
        // Clear selection before updating UI to ensure points show in their group color
        // instead of the selection color
        selectedDataPoints = [];
        
        // Remove the modal
        document.body.removeChild(modalOverlay);
        
        // Update the UI
        updateGroupToggles();
        safeChartUpdate();
        
        // Update the data summary and map
        const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
        updateOutputDisplay(dataToUse);
        updateMapWithAllData(dataToUse);
        
        showMessage(`Group "${group.name}" updated with ${pointsToAdd.length} points.`, 'success');
    });
    
    // Add buttons to container
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(saveButton);
    
    // Add elements to modal
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalInstructions);
    modalContent.appendChild(buttonContainer);
    
    // Add modal to page
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    
    // Highlight the group's points on the chart
    selectedDataPoints = [...group.points];
    safeChartUpdate();
}

/**
 * Sets up all event listeners for the application
 */
function setupEventListeners() {
    // Initialize custom file input styling
    if (fileInput && fileStatus && dragDropArea) {
        // Click to browse
        dragDropArea.addEventListener('click', (e) => {
            // Only trigger file input click if the click was directly on the drag area
            // and not on the file input itself
            if (e.target !== fileInput) {
                e.preventDefault();
                fileInput.click();
            }
        });
        
        // File selected via browse
        fileInput.addEventListener('change', (e) => {
            handleFileSelection(e.target.files);
        });
        
        // Drag and drop events
        dragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDropArea.classList.add('drag-over');
        });
        
        dragDropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDropArea.classList.remove('drag-over');
        });
        
        dragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDropArea.classList.remove('drag-over');
            
            if (e.dataTransfer.files.length) {
                handleFileSelection(e.dataTransfer.files);
            }
        });
    }
    
    // Initialize smooth scrolling for navigation
    const navLinks = document.querySelectorAll('.main-nav a');
    if (navLinks && navLinks.length > 0) {
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remove active class from all links
                navLinks.forEach(navLink => navLink.classList.remove('active'));
                
                // Add active class to clicked link
                link.classList.add('active');
                
                // Scroll to the section
                const targetId = link.getAttribute('href').substring(1);
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    window.scrollTo({
                        top: targetSection.offsetTop - 20,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }
    
    // Modal event listeners
    const helpLink = document.getElementById('help-link');
    const infoLink = document.getElementById('info-link');
    const helpModal = document.getElementById('help-modal');
    const infoModal = document.getElementById('info-modal');
    const modalCloseBtns = document.querySelectorAll('.modal-close-btn');
    
    if (helpLink && helpModal) {
        helpLink.addEventListener('click', function(e) {
            e.preventDefault();
            helpModal.style.display = 'flex';
            setTimeout(() => {
                helpModal.classList.add('active');
            }, 10);
        });
    }
    
    if (infoLink && infoModal) {
        infoLink.addEventListener('click', function(e) {
            e.preventDefault();
            infoModal.style.display = 'flex';
            setTimeout(() => {
                infoModal.classList.add('active');
            }, 10);
        });
    }
    
    // Close modals when close button is clicked
    modalCloseBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal-overlay');
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300); // Match the CSS transition duration
        });
    });
    
    // Close modals when clicking outside of modal content
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('active');
            setTimeout(() => {
                e.target.style.display = 'none';
            }, 300);
        }
    });
    
    // Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal-overlay.active');
            openModals.forEach(modal => {
                modal.classList.remove('active');
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 300);
            });
        }
    });
    
    // Set up event listeners for existing functionality
    if (downloadButton && exportFormatSelect) {
        downloadButton.addEventListener('click', () => handleDownloadData(exportFormatSelect.value || 'excel'));
    }
    
    // Set up event listeners for grouping functionality
    if (applyGroupBtn) {
        applyGroupBtn.addEventListener('click', handleApplyCustomGroup);
    }
    
    // Add keyboard event listeners for point removal feature
    document.addEventListener('keydown', (e) => {
        console.log('Key down:', e.key);
        if (e.key && e.key.toLowerCase() === 'r') {
            console.log('R key pressed');
            isRKeyPressed = true;
            // Change cursor to indicate removal mode is active
            if (chartCanvas) {
                chartCanvas.style.cursor = 'crosshair';
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        console.log('Key up:', e.key);
        if (e.key && e.key.toLowerCase() === 'r') {
            console.log('R key released');
            isRKeyPressed = false;
            // Reset cursor
            if (chartCanvas) {
                chartCanvas.style.cursor = 'default';
            }
        }
    });
    
    // Add event listener to clear selection when clicking outside the chart
    document.addEventListener('click', (e) => {
        // If we clicked on the chart or any of its children, do nothing
        if (chartCanvas && (e.target === chartCanvas || chartCanvas.contains(e.target))) {
            return;
        }
        
        // If we clicked on a form control in the grouping section, do nothing
        const groupingSection = document.querySelector('.grouping-section');
        if (groupingSection && groupingSection.contains(e.target)) {
            return;
        }
        
        // Otherwise, clear the selection if we have selected points
        if (selectedDataPoints.length > 0) {
            clearSelection();
        }
    });
    
    // Add event listener for restore points button
    if (restorePointsBtn) {
        restorePointsBtn.addEventListener('click', restoreRemovedPoints);
    }
    
    // Add event listener for RID selection
    if (ridSelect) {
        ridSelect.addEventListener('change', handleRIDSelection);
    }
    
    // Add Y-axis interactivity for zooming and panning
    if (chartCanvas) {
        // Add event listeners for axis interaction
        chartCanvas.addEventListener('wheel', handleAxisWheel, { passive: false });
        chartCanvas.addEventListener('mousedown', handleAxisMouseDown);
        chartCanvas.addEventListener('mousemove', handleChartMouseMoveForAxis);
        chartCanvas.addEventListener('mouseleave', handleChartMouseLeaveForAxis);
        
        // Add double-click to reset zoom
        chartCanvas.addEventListener('dblclick', function(event) {
            // Reset zoom regardless of where on the chart we click
            if (chart) {
                // Use Chart.js resetZoom method to fit all data
                chart.resetZoom();
                
                // Also call our custom resetAxisZoom function for additional adjustments
                resetAxisZoom();
                
                // Prevent default behavior (like text selection)
                event.preventDefault();
            }
        });
        
        // Add axis zoom instructions to the visualization controls
        addAxisZoomInstructions();
    }
    
    // Restore removed points button
    if (restorePointsBtn) {
        restorePointsBtn.addEventListener('click', restoreRemovedPoints);
    }
    
    // Fit to screen button
    if (fitScreenBtn) {
        fitScreenBtn.addEventListener('click', function() {
            if (chart) {
                // Use Chart.js resetZoom method to fit all data
                chart.resetZoom();
                
                // Also call our custom resetAxisZoom function for additional adjustments
                resetAxisZoom();
            }
        });
    }
}

/**
 * Generates a PDF report with data and visualizations
 * @param {Array} data - The data to include in the report
 */
function generatePDFReport(data) {
    // This is a placeholder for PDF generation functionality
    // In a real implementation, you would use a library like jsPDF
    // to generate a PDF with charts, maps, and data tables
    
    showMessage('PDF report generation is not implemented in this version.', 'error');
    
    // Example implementation would be:
    // 1. Capture chart as image
    // 2. Capture map as image
    // 3. Create data tables
    // 4. Generate PDF with all elements
    // 5. Trigger download
}

/**
 * Captures the map as an image for PDF reports
 * @returns {Promise<string>} - Promise resolving to a data URL of the map image
 */
function captureMapImage() {
    return new Promise((resolve, reject) => {
        try {
            // Create a temporary map container
            const tempMapContainer = document.createElement('div');
            tempMapContainer.style.width = '800px';
            tempMapContainer.style.height = '600px';
            tempMapContainer.style.position = 'absolute';
            tempMapContainer.style.left = '-9999px';
            document.body.appendChild(tempMapContainer);
            
            // Create a temporary map
            const tempMap = L.map(tempMapContainer).setView([0, 0], 2);
            
            // Add the same base layer as the main map
            if (map && map._layers) {
                // Try to get the active tile layer from the main map
                let baseLayerFound = false;
                Object.keys(map._layers).forEach(key => {
                    const layer = map._layers[key];
                    if (layer instanceof L.TileLayer) {
                        // Clone the tile layer to the temp map
                        L.tileLayer(layer._url, layer.options).addTo(tempMap);
                        baseLayerFound = true;
                    }
                });
                
                if (!baseLayerFound) {
                    // Fallback to OpenStreetMap if no active layer detected
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        maxZoom: 19
                    }).addTo(tempMap);
                }
            } else {
                // Fallback to OpenStreetMap if no active layer detected
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19
                }).addTo(tempMap);
            }
            
            // Helper function to add a marker with coordinates
            const addMarker = (point, options) => {
                let lat, lng;
                
                if (point.latitude !== undefined && point.longitude !== undefined) {
                    lat = point.latitude;
                    lng = point.longitude;
                } else if (point.y !== undefined && point.x !== undefined) {
                    lat = point.y;
                    lng = point.x;
                } else {
                    return; // Skip points without coordinates
                }
                
                L.circleMarker([lat, lng], options).addTo(tempMap);
            };
            
            // Add markers for all data points
            const dataToUse = filteredData.length > 0 ? filteredData : parsedData;
            
            // Add all points with default color
            dataToUse.forEach(point => {
                addMarker(point, {
                    radius: 6,
                    fillColor: 'rgb(75, 192, 192)',
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            });
            
            // Add custom group points with their respective colors
            const ridGroups = currentRID 
                ? customGroups.filter(group => group.rid === currentRID && group.visible)
                : [];
                
            ridGroups.forEach(group => {
                group.points.forEach(point => {
                    addMarker(point, {
                        radius: 6,
                        fillColor: group.color,
                        color: '#000',
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.8
                    });
                });
            });
            
            // Add selected points
            selectedDataPoints.forEach(point => {
                addMarker(point, {
                    radius: 6,
                    fillColor: 'rgb(255, 99, 132)',
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            });
            
            // Fit bounds to all points
            const allPoints = dataToUse.concat(selectedDataPoints);
            const validPoints = [];
            
            allPoints.forEach(point => {
                let lat, lng;
                
                if (point.latitude !== undefined && point.longitude !== undefined) {
                    lat = point.latitude;
                    lng = point.longitude;
                    validPoints.push([lat, lng]);
                } else if (point.y !== undefined && point.x !== undefined) {
                    lat = point.y;
                    lng = point.x;
                    validPoints.push([lat, lng]);
                }
            });
            
            if (validPoints.length > 0) {
                tempMap.fitBounds(validPoints);
            }
            
            // Wait for tiles to load
            setTimeout(() => {
                // Use html2canvas to capture the map
                html2canvas(tempMapContainer, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null
                }).then(canvas => {
                    // Convert canvas to data URL
                    const dataUrl = canvas.toDataURL('image/png');
                    
                    // Clean up
                    document.body.removeChild(tempMapContainer);
                    
                    resolve(dataUrl);
                }).catch(error => {
                    console.error('Error capturing map:', error);
                    document.body.removeChild(tempMapContainer);
                    reject(error);
                });
            }, 1000); // Wait for tiles to load
        } catch (error) {
            console.error('Error setting up map capture:', error);
            reject(error);
        }
    });
}

// Function to handle mouse move over the chart to detect axis hover
function handleChartMouseMoveForAxis(event) {
    if (!chart) return;
    
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Get axis dimensions from chart scales
    // Left Y-axis tick area is typically within 50px of the left edge
    const leftAxisX = chart.scales.y.left;
    const leftAxisWidth = chart.scales.y.width;
    
    // Right Y-axis tick area starts at the right edge minus the axis width
    const rightAxisX = chart.scales.y1.right - chart.scales.y1.width;
    const rightAxisWidth = chart.scales.y1.width;
    
    // X-axis tick area is typically within 30px of the bottom edge
    const xAxisY = chart.scales.x.bottom;
    const xAxisHeight = chart.scales.x.height;
    
    // More precise detection for the left Y-axis ticks
    isLeftAxisHovered = (x <= leftAxisX + 8); // Only the tick area, not the entire left side
    
    // More precise detection for the right Y-axis ticks
    isRightAxisHovered = (x >= rightAxisX - 8); // Only the tick area, not the entire right side
    
    // Detection for the X-axis ticks
    isXAxisHovered = (y >= xAxisY - 8 && y <= xAxisY + xAxisHeight + 8);
    
    // Change cursor when hovering over an axis
    if (isLeftAxisHovered) {
        event.target.style.cursor = 'ns-resize'; // Vertical resize cursor for left axis (pan & zoom)
    } else if (isRightAxisHovered) {
        event.target.style.cursor = 'zoom-in'; // Zoom cursor for right axis (zoom only)
    } else if (isXAxisHovered) {
        event.target.style.cursor = 'ew-resize'; // Horizontal resize cursor for X axis (pan & zoom)
    } else {
        event.target.style.cursor = 'default';
    }
}

// Function to handle mouse leave events on the chart
function handleChartMouseLeaveForAxis() {
    isLeftAxisHovered = false;
    isRightAxisHovered = false;
    isXAxisHovered = false;
}

// Function to handle mouse wheel events for axis zooming
function handleAxisWheel(event) {
    if (!chart) return;
    
    // Only handle wheel events when hovering over an axis
    if (!isLeftAxisHovered && !isRightAxisHovered && !isXAxisHovered) return;
    
    // Prevent the default scroll behavior
    event.preventDefault();
    
    // Determine which axis to zoom
    const axisToZoom = isLeftAxisHovered ? 'y' : (isRightAxisHovered ? 'y1' : 'x');
    
    // Get the current min and max values for the axis
    const scale = chart.scales[axisToZoom];
    let min = scale.min;
    let max = scale.max;
    
    // Calculate the zoom factor based on the wheel delta
    // Negative delta means zoom in, positive means zoom out
    const zoomFactor = event.deltaY < 0 ? 0.9 : 1.1;
    
    // Calculate the point under the mouse as a percentage of the axis
    const rect = event.target.getBoundingClientRect();
    let percent;
    
    if (axisToZoom === 'x') {
        // For X-axis, calculate horizontal percentage
        percent = (event.clientX - rect.left - chart.chartArea.left) / chart.chartArea.width;
    } else {
        // For Y-axes, calculate vertical percentage
        percent = 1 - (event.clientY - rect.top - chart.chartArea.top) / chart.chartArea.height;
    }
    
    // Clamp percent to [0, 1]
    percent = Math.max(0, Math.min(1, percent));
    
    // Calculate the new min and max values
    const range = max - min;
    const newRange = range * zoomFactor;
    const centerValue = min + range * percent;
    const newMin = centerValue - newRange * percent;
    const newMax = centerValue + newRange * (1 - percent);
    
    // Special handling for Y1 axis (percentage) - never go below 0
    if (axisToZoom === 'y1' && newMin < 0) {
        chart.options.scales[axisToZoom].min = 0;
        chart.options.scales[axisToZoom].max = newMax;
    } else {
        // Set the new min and max values
        chart.options.scales[axisToZoom].min = newMin;
        chart.options.scales[axisToZoom].max = newMax;
    }
    
    // Update the chart
    chart.update();
    
    // Save the zoom state for the current RID
    if (currentRID) {
        if (!zoomStates[currentRID]) {
            zoomStates[currentRID] = {};
        }
        if (!zoomStates[currentRID][axisToZoom]) {
            zoomStates[currentRID][axisToZoom] = {};
        }
        zoomStates[currentRID][axisToZoom].min = newMin;
        zoomStates[currentRID][axisToZoom].max = newMax;
    }
}

// Variables to track axis dragging
let isDraggingAxis = false;
let dragStartY = 0;
let dragStartX = 0;
let dragAxisId = null;
let dragStartMin = 0;
let dragStartMax = 0;

// Function to handle mouse down events for axis panning
function handleAxisMouseDown(event) {
    if (!chart) return;
    
    // Handle mouse down events when hovering over any axis
    if (!isLeftAxisHovered && !isXAxisHovered) return;
    
    // Start dragging
    isDraggingAxis = true;
    
    if (isXAxisHovered) {
        dragStartX = event.clientX;
        dragAxisId = 'x';
    } else {
        dragStartY = event.clientY;
        dragAxisId = 'y'; // Left Y-axis
    }
    
    // Store current axis min and max
    dragStartMin = chart.scales[dragAxisId].min;
    dragStartMax = chart.scales[dragAxisId].max;
    
    // Add mouse move and mouse up event listeners to the document
    document.addEventListener('mousemove', handleAxisDrag);
    document.addEventListener('mouseup', stopAxisDrag);
}

// Function to handle axis dragging
function handleAxisDrag(event) {
    if (!isDraggingAxis || !chart) return;
    
    // Calculate drag distance in pixels
    const dragDeltaY = event.clientY - dragStartY;
    
    // Convert pixel distance to value distance
    const dragScale = chart.scales[dragAxisId];
    const pixelToValueRatio = (dragStartMax - dragStartMin) / dragScale.height;
    const valueDelta = dragDeltaY * pixelToValueRatio;
    
    // Calculate new min and max
    let newMin = dragStartMin + valueDelta;
    let newMax = dragStartMax + valueDelta;
    
    // For y1 axis, ensure we never go below 0
    if (dragAxisId === 'y1' && newMin < 0) {
        // Adjust both min and max to keep min at 0 while preserving the range
        const range = dragStartMax - dragStartMin;
        newMin = 0;
        newMax = range;
    }
    
    // Update chart options with new min and max
    chart.options.scales[dragAxisId].min = newMin;
    chart.options.scales[dragAxisId].max = newMax;
    
    // Update the chart
    chart.update();
    
    // Save zoom state for current RID
    if (currentRID) {
        if (!zoomStates[currentRID]) {
            zoomStates[currentRID] = {};
        }
        zoomStates[currentRID].y = {
            min: chart.scales.y.min,
            max: chart.scales.y.max
        };
        zoomStates[currentRID].y1 = {
            min: chart.scales.y1.min,
            max: chart.scales.y1.max
        };
    }
}

// Function to stop axis dragging
function stopAxisDrag() {
    isDraggingAxis = false;
    
    // Remove event listeners
    document.removeEventListener('mousemove', handleAxisDrag);
    document.removeEventListener('mouseup', stopAxisDrag);
}

// Function to reset axis zoom to default (fit all data)
function resetAxisZoom() {
    if (!chart) return;
    
    // Reset left Y-axis to auto-fit the data
    delete chart.options.scales.y.min;
    delete chart.options.scales.y.max;
    
    // Reset X-axis to auto-fit the data
    delete chart.options.scales.x.min;
    delete chart.options.scales.x.max;
    
    // For right Y-axis (y1), keep min at 0 and find the appropriate max
    chart.options.scales.y1.min = 0;
    
    // Find the maximum percentage value across all datasets to set an appropriate max
    let maxPercentage = 0.001; // Default minimum (0.1%)
    
    if (chart.data && chart.data.datasets) {
        chart.data.datasets.forEach(dataset => {
            // Check for percentage datasets (using y1 axis) and continuous bars
            if ((dataset.yAxisID === 'y1' || dataset.continuousBar) && dataset.barValue !== undefined) {
                // For continuous bars, check the barValue property
                if (dataset.barValue > maxPercentage) {
                    maxPercentage = dataset.barValue;
                }
            } else if (dataset.yAxisID === 'y1' && dataset.data) {
                // For regular datasets, check all data points
                dataset.data.forEach(point => {
                    if (point.y !== undefined && point.y > maxPercentage) {
                        maxPercentage = point.y;
                    }
                });
            }
        });
    }
    
    // Add 20% padding to the max value for better visibility
    maxPercentage = maxPercentage * 1.2;
    
    // Set the max value for the Y1 axis
    chart.options.scales.y1.max = maxPercentage;
    
    // Adjust tick step size based on the range
    if (maxPercentage <= 0.001) { // 0.1%
        chart.options.scales.y1.ticks.stepSize = 0.0001; // 0.01% steps
    } else if (maxPercentage <= 0.01) { // 1%
        chart.options.scales.y1.ticks.stepSize = 0.001; // 0.1% steps
    } else if (maxPercentage <= 0.1) { // 10%
        chart.options.scales.y1.ticks.stepSize = 0.01; // 1% steps
    } else {
        chart.options.scales.y1.ticks.stepSize = 0.05; // 5% steps for larger ranges
    }
    
    console.log(`Resetting Y1 axis with max percentage: ${maxPercentage} (${maxPercentage * 100}%)`);
    
    // Update the chart
    chart.update();
    
    // Save the reset zoom state for current RID
    if (currentRID) {
        if (!zoomStates[currentRID]) {
            zoomStates[currentRID] = {};
        }
        // Save the auto-calculated min/max values after chart update
        zoomStates[currentRID].y = {
            min: chart.scales.y.min,
            max: chart.scales.y.max
        };
        zoomStates[currentRID].y1 = {
            min: 0, // Always 0 for y1
            max: chart.scales.y1.max
        };
    }
}

// Adds instructions for axis zoom and pan functionality below the chart
function addAxisZoomInstructions() {
    // Check if instructions already exist
    if (document.getElementById('axis-zoom-instructions')) {
        return;
    }
    
    // Create instruction element
    const instructionsEl = document.createElement('p');
    instructionsEl.id = 'axis-zoom-instructions';
    instructionsEl.className = 'hint-text';
    instructionsEl.innerHTML = '<i class="fas fa-info-circle"></i> Hover near Y-axes: <strong>Mouse wheel</strong> to zoom, <strong>Click & drag</strong> to pan, <strong>Double-click</strong> to reset';
    
    // Add to visualization controls
    const visualizationControls = document.querySelector('.visualization-controls');
    if (visualizationControls) {
        visualizationControls.appendChild(instructionsEl);
    }
}

// At the beginning of the file (after the existing barSpanPlugin definition)

// Function to create a single continuous bar for each group
function createGroupPercentageChangeDataset(group, percentageChange) {
    // Find the first and last point in the group
    const sortedPoints = [...group.points].sort((a, b) => a.station - b.station);
    const firstPoint = sortedPoints[0];
    const lastPoint = sortedPoints[sortedPoints.length - 1];
    
    // Apply a minimum visible value to ensure the bar is visible
    // If the percentage change is extremely small, we'll use a minimum value of 0.05%
    let visiblePercentageChange = percentageChange;
    
    // Log the actual percentage value for debugging
    console.log(`Group ${group.name} has percentage change: ${percentageChange.toFixed(5)}%`);
    
    // Create the color with transparency
    let barColor = group.color;
    if (barColor.startsWith('#')) {
        const r = parseInt(barColor.slice(1, 3), 16);
        const g = parseInt(barColor.slice(3, 5), 16);
        const b = parseInt(barColor.slice(5, 7), 16);
        barColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
    } else {
        barColor = barColor.replace(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/, 'rgba($1, $2, $3, 0.5)');
    }
    
    // Return the dataset object
    return {
        label: `${group.name} % Change`,
        data: [], // Empty data array - we don't need actual points
        backgroundColor: barColor,
        borderColor: group.color,
        borderWidth: 1,
        yAxisID: 'y1',
        continuousBar: true, // Flag for our plugin
        startX: firstPoint.station, // Start of the bar
        endX: lastPoint.station,    // End of the bar
        barValue: visiblePercentageChange    // The percentage change value
    };
}

/**
 * Calculates percentage changes between adjacent groups and creates transition bars
 * @param {Array} datasets - The current chart datasets
 * @param {Array} ridGroups - The groups for the current RID
 * @returns {Array} - Updated datasets with transition bars between groups
 */
function addGroupTransitionBars(datasets, ridGroups) {
    // If we have fewer than 2 groups, there are no transitions to calculate
    if (!ridGroups || ridGroups.length < 2) {
        console.log('Not enough groups for transition bars:', ridGroups.length);
        return datasets;
    }
    
    console.log('Creating transition bars between', ridGroups.length, 'groups');
    
    // Sort groups by their starting station (first point)
    const sortedGroups = [...ridGroups].sort((a, b) => {
        const aFirstStation = Math.min(...a.points.map(p => p.station));
        const bFirstStation = Math.min(...b.points.map(p => p.station));
        return aFirstStation - bFirstStation;
    });
    
    console.log('Sorted groups:', sortedGroups.map(g => g.name));
    
    let transitionBarsCreated = 0;
    
    // For each adjacent pair of groups, calculate the transition
    for (let i = 0; i < sortedGroups.length - 1; i++) {
        const currentGroup = sortedGroups[i];
        const nextGroup = sortedGroups[i + 1];
        
        // Skip if either group is not visible
        if (!currentGroup.visible || !nextGroup.visible) {
            console.log(`Skipping transition between ${currentGroup.name} and ${nextGroup.name} - visibility issue`);
            continue;
        }
        
        // Get the last point of the current group and first point of the next group
        const currentGroupPoints = [...currentGroup.points].sort((a, b) => a.station - b.station);
        const nextGroupPoints = [...nextGroup.points].sort((a, b) => a.station - b.station);
        
        if (currentGroupPoints.length === 0 || nextGroupPoints.length === 0) {
            console.log(`Skipping transition - empty group points: ${currentGroup.name}=${currentGroupPoints.length}, ${nextGroup.name}=${nextGroupPoints.length}`);
            continue;
        }
        
        const lastPointOfCurrentGroup = currentGroupPoints[currentGroupPoints.length - 1];
        const firstPointOfNextGroup = nextGroupPoints[0];
        
        // Skip if we don't have valid points
        if (!lastPointOfCurrentGroup || !firstPointOfNextGroup) {
            console.log(`Skipping transition between ${currentGroup.name} and ${nextGroup.name} - missing points`);
            continue;
        }
        
        console.log(`Creating transition between ${currentGroup.name} (station ${lastPointOfCurrentGroup.station}) and ${nextGroup.name} (station ${firstPointOfNextGroup.station})`);
        
        // Determine which parameter to use (prefer current if available)
        const displayParameter = lastPointOfCurrentGroup.current !== undefined ? 'current' : activeParameter;
        
        // Calculate the percentage change between the last point of current group and first point of next group
        const startValue = lastPointOfCurrentGroup[displayParameter];
        const endValue = firstPointOfNextGroup[displayParameter];
        const stationDistance = firstPointOfNextGroup.station - lastPointOfCurrentGroup.station;
        
        // Skip if distance is too small or values are invalid
        if (stationDistance <= 0 || isNaN(startValue) || isNaN(endValue) || startValue === 0) {
            console.log(`Skipping transition - invalid distance or values: distance=${stationDistance}, startValue=${startValue}, endValue=${endValue}`);
            continue;
        }
        
        // Calculate percentage change per 100 feet
        const absoluteChange = endValue - startValue;
        // Use Math.abs to ensure we always get a positive percentage change
        const percentChange = (Math.abs(absoluteChange) / Math.abs(startValue)) * (100 / (stationDistance / 100));
        
        // Skip if percentage change is invalid or too extreme
        if (isNaN(percentChange) || !isFinite(percentChange) || Math.abs(percentChange) > 1000) {
            console.log(`Skipping transition - invalid percentage change: ${percentChange}%`);
            continue;
        }
        
        console.log(`Transition calculation: startValue=${startValue}, endValue=${endValue}, distance=${stationDistance}, absoluteChange=${Math.abs(absoluteChange)}, percentChange=${percentChange}%`);
        
        // Create a transition color that blends the two group colors
        let transitionColor = 'rgba(128, 128, 128, 0.7)'; // Default gray
        
        // Try to blend the colors if they're in a format we can parse
        try {
            if (currentGroup.color.startsWith('#') && nextGroup.color.startsWith('#')) {
                // Convert hex to rgb
                const currentRgb = {
                    r: parseInt(currentGroup.color.slice(1, 3), 16),
                    g: parseInt(currentGroup.color.slice(3, 5), 16),
                    b: parseInt(currentGroup.color.slice(5, 7), 16)
                };
                
                const nextRgb = {
                    r: parseInt(nextGroup.color.slice(1, 3), 16),
                    g: parseInt(nextGroup.color.slice(3, 5), 16),
                    b: parseInt(nextGroup.color.slice(5, 7), 16)
                };
                
                // Blend the colors (simple average)
                const blendedRgb = {
                    r: Math.floor((currentRgb.r + nextRgb.r) / 2),
                    g: Math.floor((currentRgb.g + nextRgb.g) / 2),
                    b: Math.floor((currentRgb.b + nextRgb.b) / 2)
                };
                
                transitionColor = `rgba(${blendedRgb.r}, ${blendedRgb.g}, ${blendedRgb.b}, 0.7)`;
            }
        } catch (e) {
            console.warn('Error blending colors for transition bar:', e);
        }
        
        // Ensure the bar value is valid
        const barValue = percentChange / 100; // Convert to decimal for consistency with other bars
        
        // Create a dataset for the transition bar
        datasets.push({
            label: `${currentGroup.name} → ${nextGroup.name} Transition`,
            // Empty data array - we don't need actual points
            data: [],
            backgroundColor: transitionColor,
            borderColor: transitionColor.replace('0.7', '1.0'),
            borderWidth: 1,
            borderDash: [5, 5], // Dashed border to distinguish from regular group bars
            // Use special properties for continuous bar rendering
            yAxisID: 'y1',
            order: 0,
            // Add custom properties for the continuous bar
            continuousBar: true,
            startX: lastPointOfCurrentGroup.station,
            endX: firstPointOfNextGroup.station,
            barValue: barValue,
            isTransition: true // Mark as a transition bar
        });
        
        transitionBarsCreated++;
    }
    
    console.log(`Created ${transitionBarsCreated} transition bars`);
    
    return datasets;
}

/**
 * Calculates percentage changes between adjacent groups
 * Identifies the last point of each group and the first point of the next group
 * @returns {Object} Map of station values to between-group change data
 */
function calculateBetweenGroupChanges() {
    if (customGroups.length < 2) {
        return {}; // No transitions if we have fewer than 2 groups
    }
    
    const betweenGroupChanges = {};
    
    try {
        // Sort all data points by station
        const sortedData = [...parsedData].sort((a, b) => a.station - b.station);
        
        // Create a map of station to group
        const stationToGroupMap = {};
        customGroups.forEach(group => {
            group.points.forEach(point => {
                stationToGroupMap[point.station] = {
                    groupId: group.id,
                    groupName: group.name
                };
            });
        });
        
        // Find group transitions in the sorted data
        for (let i = 0; i < sortedData.length - 1; i++) {
            const currentPoint = sortedData[i];
            const nextPoint = sortedData[i + 1];
            
            const currentGroup = stationToGroupMap[currentPoint.station];
            const nextGroup = stationToGroupMap[nextPoint.station];
            
            // Check if this is a transition between groups
            if (currentGroup && nextGroup && currentGroup.groupId !== nextGroup.groupId) {
                console.log(`Found group transition from "${currentGroup.groupName}" to "${nextGroup.groupName}" between stations ${currentPoint.station} and ${nextPoint.station}`);
                
                // Calculate distance between points
                const distance = Math.abs(nextPoint.station - currentPoint.station);
                
                // Skip if distance is too small
                if (distance < 0.1) continue;
                
                // Get current values for both points
                const currentValue = currentPoint.current !== undefined ? 
                    currentPoint.current : 
                    currentPoint[activeParameter];
                
                const nextValue = nextPoint.current !== undefined ? 
                    nextPoint.current : 
                    nextPoint[activeParameter];
                
                // Skip if either value is too close to zero
                if (Math.abs(currentValue) < 0.0001 || Math.abs(nextValue) < 0.0001) continue;
                
                // Calculate percentage change
                const percentChange = Math.abs((currentValue - nextValue) / nextValue / distance * 100);
                
                // Cap extreme values for display purposes
                const cappedPercentChange = percentChange > 100 ? 100 : percentChange;
                
                // Skip if the percentage change is invalid
                if (!isNaN(percentChange) && isFinite(percentChange)) {
                    // Store the transition data with the last point of the current group
                    betweenGroupChanges[currentPoint.station] = {
                        percentChange: cappedPercentChange,
                        actualPercentChange: percentChange,
                        nextGroupName: nextGroup.groupName,
                        nextGroupId: nextGroup.groupId,
                        distance: distance
                    };
                }
            }
        }
    } catch (error) {
        console.error('Error calculating between-group changes:', error);
    }
    
    return betweenGroupChanges;
}
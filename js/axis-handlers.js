/**
 * Axis interaction handlers for chart zooming and panning
 * Copy these functions to replace the existing ones in app.js
 */

// Variables to track axis hover state
let isLeftAxisHovered = false;
let isRightAxisHovered = false;
let isXAxisHovered = false;

// Variables to track axis dragging
let isDraggingAxis = false;
let dragStartY = 0;
let dragStartX = 0;
let dragAxisId = null;
let dragStartMin = 0;
let dragStartMax = 0;

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
    
    let valueDelta;
    
    if (dragAxisId === 'x') {
        // For X-axis, calculate horizontal drag
        const dragDeltaX = event.clientX - dragStartX;
        
        // Convert pixel distance to value distance
        const dragScale = chart.scales[dragAxisId];
        const pixelToValueRatio = (dragStartMax - dragStartMin) / dragScale.width;
        
        // Apply a sensitivity factor to make X-axis dragging less sensitive (0.25 = 1/4 the speed)
        const xAxisSensitivity = 0.25;
        valueDelta = -dragDeltaX * pixelToValueRatio * xAxisSensitivity; // Negative because dragging right should move the chart left
    } else {
        // For Y-axes, calculate vertical drag
        const dragDeltaY = event.clientY - dragStartY;
        
        // Convert pixel distance to value distance
        const dragScale = chart.scales[dragAxisId];
        const pixelToValueRatio = (dragStartMax - dragStartMin) / dragScale.height;
        valueDelta = dragDeltaY * pixelToValueRatio;
    }
    
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
        if (!zoomStates[currentRID][dragAxisId]) {
            zoomStates[currentRID][dragAxisId] = {};
        }
        zoomStates[currentRID][dragAxisId].min = newMin;
        zoomStates[currentRID][dragAxisId].max = newMax;
    }
}

// Function to stop axis dragging
function stopAxisDrag() {
    isDraggingAxis = false;
    
    // Remove event listeners
    document.removeEventListener('mousemove', handleAxisDrag);
    document.removeEventListener('mouseup', stopAxisDrag);
} 
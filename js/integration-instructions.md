# X-Axis Hover and Drag Integration Instructions

Follow these steps to integrate the new axis handlers that support X-axis hover and dragging functionality:

## Step 1: Replace the Axis Variables

Find the existing axis hover variables in `app.js` (likely near the top of the file with other variable declarations):

```javascript
// Variables to track axis hover state
let isLeftAxisHovered = false;
let isRightAxisHovered = false;
```

Replace with:

```javascript
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
```

## Step 2: Replace the Axis Handler Functions

Replace the following functions in `app.js` with the versions from `axis-handlers.js`:

1. `handleChartMouseMoveForAxis`
2. `handleChartMouseLeaveForAxis`
3. `handleAxisWheel`
4. `handleAxisMouseDown`
5. `handleAxisDrag`
6. `stopAxisDrag`

## Step 3: Update Event Listeners

Make sure the chart canvas has the appropriate event listeners. Find the code where the chart is created and event listeners are attached (likely after the chart initialization):

```javascript
// Add event listeners for axis interactions
chartCanvas.addEventListener('mousemove', handleChartMouseMoveForAxis);
chartCanvas.addEventListener('mouseleave', handleChartMouseLeaveForAxis);
chartCanvas.addEventListener('wheel', handleAxisWheel);
chartCanvas.addEventListener('mousedown', handleAxisMouseDown);
```

## Step 4: Test the Functionality

After making these changes:

1. Hover over the X-axis - the cursor should change to an east-west resize cursor
2. Scroll while hovering over the X-axis - it should zoom in/out horizontally
3. Click and drag the X-axis - it should pan the chart horizontally

## Notes

- The X-axis hover detection is set to work within 8 pixels of the X-axis area
- Dragging right on the X-axis moves the chart view left (earlier in time)
- Dragging left on the X-axis moves the chart view right (later in time)
- The zoom functionality for the X-axis works similar to the Y-axes, zooming centered on the mouse position
- **X-axis panning sensitivity** has been reduced to 25% of the default to prevent the chart from moving too quickly when dragging horizontally

## Customizing Sensitivity

If you need to adjust the X-axis panning sensitivity, locate this line in the `handleAxisDrag` function:

```javascript
const xAxisSensitivity = 0.25; // 0.25 = 1/4 the speed
```

You can modify this value to make the panning more or less sensitive:
- Lower values (e.g., 0.1) make the panning slower and more precise
- Higher values (e.g., 0.5) make the panning faster 
# PCM Data Grouping Tool - Technical Documentation

## Overview

The Pipeline Current Mapping (PCM) Data Grouping Tool is a web-based application designed for analyzing, visualizing, and grouping pipeline current mapping data. This documentation provides detailed information about the data processing algorithms, formulas, and functionality of the application.

## Table of Contents

1. [Data Import and Processing](#data-import-and-processing)
2. [Key Formulas and Calculations](#key-formulas-and-calculations)
3. [Data Grouping and Organization](#data-grouping-and-organization)
4. [Visualization Algorithms](#visualization-algorithms)
5. [File Format Requirements](#file-format-requirements)
6. [Technical Implementation Details](#technical-implementation-details)

## Data Import and Processing

### File Processing Workflow

The application processes Excel (.xlsx) files using the following workflow:

1. The file is read using the FileReader API
2. Excel data is parsed using SheetJS (XLSX)
3. Data is structured and normalized into a consistent format
4. RID (Route ID) values are extracted if present for dataset selection
5. Data points are sorted by station for easier analysis

### Data Point Structure

Each data point is transformed into an object with the following properties:

```javascript
{
  station: Number,       // The measurement station position
  value: Number,         // The original signal value (mA)
  signal: Number,        // Same as value, for consistency
  current: Number,       // Calculated dBmA value using LOG10(signal) * 20
  x: Number,             // X coordinate (if present)
  y: Number,             // Y coordinate (if present)
  longitude: Number,     // Same as X, for mapping
  latitude: Number,      // Same as Y, for mapping
  pointtype: String,     // Type of measurement point
  rid: String,           // Route ID (if present)
  createdon: String,     // Creation date (if present)
  anomaly: Number,       // Anomaly flag (0=none, 1=possible, 2=definite)
  group: String          // Custom group assignment (null by default)
}
```

## Key Formulas and Calculations

### Current (dBmA) Calculation

The application converts signal values (mA) to current values in dBmA using the following formula:

```
current = LOG10(signal_value) * 20
```

For zero or negative signal values (where LOG10 is undefined), a default value of -60 dBmA is used.

### Percentage Change Calculation

Percentage change between consecutive data points is calculated using:

```
percentChange = ABS((reference_value - current_value) / divisor / distance * 100)
```

Where:
- `reference_value` is the value at the reference point (typically the first point)
- `current_value` is the value at the current point
- `divisor` is a constant (default = 1.0)
- `distance` is the distance between the points (in feet)
- The result is the absolute percentage change per unit distance

For display purposes, percentage changes are capped at 100% to prevent extreme values from distorting the visualization.

### Reference Point Selection

When calculating percentage changes for custom groups, the application uses a specific reference point approach:

1. When a user creates a custom group by selecting points on the chart, the points are automatically sorted by station value (ascending)
2. **The first point in the sorted group (the point with the lowest station value) is always used as the reference point**
3. All percentage changes within that group are calculated relative to this reference point
4. This approach ensures consistent and comparable measurements within each custom group

### Group Processing

When calculating statistics for custom groups, the application:

1. Sorts points by station within each group
2. Uses the first point in the group as the reference point
3. Calculates percentage changes relative to this reference
4. Groups and processes data by RID to prevent cross-group calculations

## Data Grouping and Organization

### Custom Group Structure

Custom groups are defined with the following properties:

```javascript
{
  id: String,           // Unique identifier for the group
  name: String,         // User-defined name for the group
  color: String,        // Color code (rgba or hex) for visualization
  points: Array,        // Array of data points in this group
  rid: String,          // Route ID this group belongs to
  visible: Boolean      // Whether group is visible in visualizations
}
```

### Group Selection Algorithm

The selection process uses the following steps:

1. User defines a rectangular selection area on the chart
2. Points inside this area are identified using coordinate comparison
3. Multiple selections can be made using the shift key
4. Points are grouped and assigned a unique color
5. Group visibility can be toggled individually

## Visualization Algorithms

### Chart Visualization

The application uses Chart.js for data visualization with:

- Scatter plots for individual data points
- Line connections to show trends
- Color coding to distinguish between groups
- Interactive tooltips showing point details
- Axis zooming and panning for detailed analysis

### Map Visualization

Geographic data is displayed using Leaflet.js with:

- Markers showing the location of each data point
- Color-coded markers matching the chart visualization
- Consistent color-coding between chart and map
- Popup information showing point details
- Group toggling affecting both chart and map

## File Format Requirements

### Required Columns

The Excel file must include the following columns:

| Column Name | Description | Required |
|-------------|-------------|----------|
| MEAS | Station position (in feet) | Yes |
| SIGNAL | Signal measurement value (in mA) | Yes |
| POINTTYPE | Type of measurement point | Yes |
| X | X-coordinate for mapping | Optional |
| Y | Y-coordinate for mapping | Optional |
| RID | Route identifier | Optional |
| CREATEDON | Creation date/time | Optional |

Column names are case-insensitive. Additional columns will be preserved in the data but may not be used for visualization.

## Technical Implementation Details

### Data Processing Functions

Key data processing functions include:

- `parseExcelData()`: Transforms raw Excel data into structured format
- `organizeDataParameters()`: Identifies available parameters in the data
- `processAndDisplayData()`: Prepares data for visualization
- `calculatePercentageChange()`: Computes changes between data points
- `updateChartWithCustomGroups()`: Applies custom grouping to visualizations

### Output Data Format

Exported data maintains the original structure with added fields:

- All original columns from the imported file
- Custom group assignments
- Calculated percentage changes
- Current values in dBmA

### Data Export Options

The application supports exporting processed data in:

- CSV format (comma-separated values)
- Excel format (.xlsx)
- With all custom groups and calculations included

# X-Axis Hover and Drag Functionality

This package provides enhanced axis interaction for Chart.js charts, adding X-axis hover detection and dragging functionality to complement the existing Y-axis interactions.

## Files Included

- **js/axis-handlers.js**: Contains the complete set of updated axis interaction handlers that support both Y-axis and X-axis hover, zoom, and drag functionality.
- **js/integration-instructions.md**: Step-by-step instructions for integrating these handlers into your existing app.js file.

## Features Added

1. **X-Axis Hover Detection**: The cursor now changes to an east-west resize cursor when hovering over the X-axis.
2. **X-Axis Zooming**: Users can zoom in/out on the X-axis by scrolling the mouse wheel while hovering over the X-axis.
3. **X-Axis Panning**: Users can click and drag the X-axis to pan the chart horizontally.
4. **Optimized Sensitivity**: X-axis panning sensitivity has been calibrated to prevent too-fast movement when dragging.

## Implementation Details

The implementation includes:

- Added `isXAxisHovered` variable to track X-axis hover state
- Enhanced hover detection to identify when the mouse is over the X-axis
- Updated mouse wheel handler to support zooming on the X-axis
- Modified drag handlers to support horizontal dragging for the X-axis
- Ensured proper cursor feedback when hovering over different axes
- Added sensitivity adjustment for X-axis panning (25% of default) to provide smoother control

## Integration

See the `js/integration-instructions.md` file for detailed steps on how to integrate these changes into your existing codebase.

## Benefits

- Improved user experience with consistent interaction patterns across all axes
- More intuitive navigation of time-series data
- Enhanced chart exploration capabilities with multi-axis zoom and pan support
- Precise control over horizontal panning with optimized sensitivity 
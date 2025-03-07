# PCM Data Grouping Tool

A web-based tool for analyzing, grouping, and visualizing Pipeline Current Mapping (PCM) data.

## Features

- Excel file parsing with multi-dataset support
- Interactive data visualization with Plotly.js
- Custom grouping of PCM data points
- Geographic mapping with proper point type display
- Automatic current calculation and percentage change analysis
- Export in multiple formats (Excel, CSV, JSON)

## Supported Data Format

This tool accepts Excel (.xlsx) files with PCM data. Required columns include:

- **MEAS:** Station position (required)
- **SIGNAL:** The signal value in mA (required)
- **POINTTYPE:** The data point type (required)
- **X/Y:** Coordinates for mapping (optional)
- **RID:** Route ID for multiple datasets (optional)

## Usage

1. Upload your Excel (.xlsx) file in the upload area
2. Select a Route ID if your data contains multiple datasets
3. Use the interactive chart to analyze and select data points
4. Create custom groups to classify points with similar characteristics
5. Export your data with all custom groups and analysis results

## About PCM Data

Pipeline Current Mapping (PCM) is a survey technique used to assess the condition of pipeline coatings and cathodic protection systems. This tool helps engineers and technicians analyze PCM data by:

- Converting signal values to current in dBmA
- Calculating percentage changes between points
- Identifying regions with similar characteristics
- Visualizing data geographically when coordinates are available

## License

© 2025 Lake Superior Consulting | All Rights Reserved 
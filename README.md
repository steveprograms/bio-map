## bio-map

An exploratory tool for spotting and researching environment–health patterns across the US that are worth investigating. It is built around county profiles, and makes use of analysis tools that go beyond what the eye can see on a map.

#### Data
County/State Boundaries: Census 2024 state and county files
Health: CDC PLACES 2025 release: 40 measures
Social Context: CDC/ATSDR Social Vulnerability Index 2022: 4 themes, 16 indicators
Exposures: EPA TRI 2024 summed per county; modeled PM2.5 and Ozone from CDC Tracking Network

#### Map Layers
Basemap: OpenFreeMap Positron
Country Layer: Dropdown of all measures grouped by category
Facility Layer: EPA TRI facility air releases: heatmap, and clickable facility circles when zoomed in

#### Observation and Research Tools
Selection: Select up to 6 counties to examine key measures and compare counties
Comparison: Table of selected counties with key/all measures, percentile comparisons
Two-measure map: 3x3 bivariate coloring of two selected measures for all counties
Outcome and exposure scans: Select an outcome or exposure, and see how other measures/exposures are statistically correlated

## Getting Started

```bash
nom install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to view the app.

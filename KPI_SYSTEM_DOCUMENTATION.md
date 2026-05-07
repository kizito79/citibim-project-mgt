# KPI Summary Page - Technical Documentation

## Overview
The KPI Summary Page is a professional, grid-based dashboard for creating and managing Key Performance Indicator (KPI) cards. It features a clean, optimized header with action buttons that trigger modals for different types of KPI creation.

## Features

### 1. **Optimized Header UI**
- **Editable Project Title**: Click to edit the project title directly (contenteditable)
- **Project Selector**: Dropdown to select/filter by project
- **Action Buttons**: Five main action buttons for creating different KPI types

### 2. **Create Stats KPI**
Generates chart-based KPI cards with multiple chart type options.

**Modal Fields:**
- Card Title (required)
- Select Project (required)
- Select Field/Column (required)
- Chart Type (required)
  - Bar Chart
  - Line Chart
  - Pie Chart
  - Donut Chart
  - Area Chart
  - Radar Chart
  - Scatter Chart
- Card Size (required)
  - Small (4×6)
  - Medium (6×8)
  - Large (8×10)
  - X-Large (12×12)

**Features:**
- Preview button to see card before creation
- Automatic field population based on selected project
- GridStack integration for responsive layout
- Lock/Unlock and Remove buttons on each card

### 3. **Create Value KPI**
Generates value-based KPI cards showing calculated metrics.

**Modal Fields:**
- Card Title (required)
- Select Project (required)
- Select Field/Column (required)
- Calculation Type (required)
  - Sum
  - Count
  - Average
  - Minimum
  - Maximum
  - Percentage
- Card Size (required)
  - Small (4×6)
  - Medium (6×8)
  - Large (8×10)
- Display Type (required)
  - Number
  - Percentage
  - Currency
  - Decimal

**Features:**
- Large, prominent number display
- Customizable formatting based on display type
- Real-time calculation
- Statistical operations

### 4. **Create Gantt KPI**
Generates Gantt chart KPI cards for timeline visualization.

**Modal Fields:**
- Card Title (required)
- Select Project (required)
- Start Date Field (required)
- End Date Field (required)
- Gantt Chart Type (required)
  - Project Timeline
  - Resource Allocation
  - Milestone View
- Card Size (required)
  - Medium (8×8)
  - Large (12×10)
  - X-Large (12×14)

**Features:**
- Date field validation
- Timeline visualization
- Multiple Gantt chart styles
- Larger default size for better visibility

### 5. **Add Project Location**
Creates interactive map cards for project locations.

**Modal Fields:**
- Select Project (required)
- Latitude Column (required)
- Longitude Column (required)
- Photo Column (optional)

**Features:**
- Leaflet.js integration for map rendering
- Automatic marker placement from lat/lon data
- Optional photo column linking
- Full-width card support (12×6 default)

### 6. **Add Project Photo**
Creates photo gallery cards for project images.

**Modal Fields:**
- Select Project (required)
- Photo Column (optional)
- Photo URL/Link (optional)
- Photo Title/Caption (optional)

**Features:**
- Source photos from project column OR external URL
- Custom captions for photos
- Flexible input options
- Image gallery layout

## Technical Implementation

### File Structure
```
/workspaces/codespaces-blank/Gant/
├── index.html                 (HTML structure + modals)
├── styles.css                 (CSS styling + responsive design)
├── script.js                  (Main app logic)
├── kpi-modals.js              (KPI modal system)
├── server.js                  (Express server)
└── package.json               (Dependencies)
```

### Key JavaScript Classes & Functions

#### KPIModals Object
Main controller for all modal functionality.

**Key Methods:**
- `init()` - Initialize all event listeners
- `openModal(modalId)` - Open a specific modal
- `closeModal(modalId)` - Close a modal
- `populateProjectSelects()` - Load projects into dropdowns
- `populateFieldSelect(projectSelectId, fieldSelectId)` - Populate fields based on project
- `createStatsCard()` - Create stats KPI card
- `createValueCard()` - Create value KPI card
- `createGanttCard()` - Create Gantt KPI card
- `createLocationCard()` - Create location/map card
- `createPhotoCard()` - Create photo card
- `addCardToGrid(cardData)` - Add card to GridStack grid
- `generateCardHTML(cardData)` - Generate HTML for card content
- `setupCardActions(cardElement)` - Setup lock/remove buttons

### CSS Architecture

#### KPI Header Styling
- Flexbox layout with responsive breakpoints
- Editable title with focus states
- Action button grid with hover effects
- Mobile-optimized stacking

#### Modal Styling
- Fixed positioning with overlay backdrop
- Smooth animations (fadeIn, slideUp)
- Responsive max-widths (md: 500px, lg: 700px)
- Glassmorphism backdrop blur effect

#### Form Styling
- Consistent input/select styling
- Focus states with blue accent border
- Field grouping with gap spacing
- Two-column layout for related fields (responsive)

#### Responsive Design
- Mobile: Buttons stack horizontally
- Tablet: Forms reflow to single column
- Desktop: Full layout with multiple columns
Mobile media query: `@media (max-width: 768px)`

### Data Structure

#### Card Data Format
```javascript
{
  title: String,           // Card title
  project: Number,         // Project ID
  field: String,           // Data field/column
  chartType: String,       // For stats cards
  calcType: String,        // For value cards
  cardSize: String,        // small|medium|large|xlarge
  displayType: String,     // For value cards
  type: String            // stats|value|gantt|map|photo
}
```

### Integration Points

#### With GridStack
- New cards automatically added to GridStack grid
- Custom sizes map to GridStack dimensions:
  - small: 4×6
  - medium: 6×8 (8×8 for Gantt)
  - large: 8×10 (12×10 for Gantt)
  - xlarge: 12×12 (12×14 for Gantt)

#### With Chart.js
- Stats KPI cards use Chart.js for visualization
- Canvas elements created dynamically
- Chart types: bar, line, pie, donut, area, radar, scatter

#### With Leaflet.js
- Location cards use Leaflet for map rendering
- Markers placed from latitude/longitude data
- Support for custom zoom/center

### Event Flow

1. User clicks action button
2. Modal opens with form fields
3. User fills required fields
4. User clicks "Create Card" or "Preview"
5. Validation runs
6. Card added to grid or preview shown
7. Success notification displayed
8. Modal closes automatically

## Styling Reference

### CSS Variables (from root)
```css
--accent-blue: #38bdf8          /* Primary accent */
--accent-orange: #fb923c        /* Action button accent */
--accent-purple: #a78bfa        /* Preview button */
--bg-secondary: Dark mode secondary background
--border-color: Modal/form borders
--text-primary: Main text color
--text-secondary: Secondary text color
```

## Usage Guide

### For End Users

1. **Edit Project Title**
   - Click the title to enable editing
   - Type new title
   - Click away or press Enter to save

2. **Select Project**
   - Use the dropdown next to the title
   - Modals will populate with that project's data

3. **Create KPI Cards**
   - Click any action button
   - Fill in the required fields
   - (Optional) Click Preview to see before creating
   - Click Create Card
   - Card appears in the grid
   - Lock to prevent accidental moves
   - Remove button to delete card

### For Developers

1. **Add Custom Projects**
   - Modify `KPIModals.loadProjects()` method
   - Add to `KPIModals.projects` array
   - Add fields to `KPIModals.projectFields` object

2. **Add New Chart Types**
   - Update chart type selects in modals
   - Extend `generateCardHTML()` function
   - Add canvas or container element

3. **Customize Card Sizes**
   - Edit `sizeMap` in `addCardToGrid()` method
   - Update GridStack dimensions as needed

4. **Add New KPI Types**
   - Create new modal template in HTML
   - Add event listener in `setupModalButtons()`
   - Create handler method (e.g., `createCustomCard()`)
   - Generate HTML in `generateCardHTML()`

## Performance Considerations

- **Lazy Loading**: Cards render on demand
- **GridStack Debouncing**: Resize/move operations debounced
- **Modal Reuse**: Same modal templates for multiple modals
- **Event Delegation**: Parent element listeners vs individual

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 12+)
- IE: Not supported (requires modern ES6)

## Accessibility Features

- Semantic HTML structure
- Form labels properly associated
- Keyboard navigation support (Tab, Enter, Escape)
- ARIA descriptions for stateful elements
- Proper focus management in modals

## Future Enhancements

1. **Advanced Charting**
   - Real-time data updates
   - Chart animation options
   - Custom color schemes

2. **Export Features**
   - Export individual cards as images
   - Batch export as PDF

3. **Collaboration**
   - Share dashboards with team
   - Comments on cards
   - Version history

4. **Data Sources**
   - Direct database connections
   - API integration
   - Real-time data streams

5. **Card Customization**
   - Custom styling per card
   - Conditional formatting
   - Drill-down capabilities

## Troubleshooting

### Modal Won't Open
- Check browser console for errors
- Ensure kpi-modals.js is loaded
- Verify modal ID is correct

### Cards Not Showing
- Check GridStack initialization
- Verify GridStack CSS is loaded
- Check card data in browser dev tools

### Fields Not Populating
- Verify projects are loaded
- Check `projectFields` object has data
- Ensure project ID is valid

## Support

For issues or questions:
1. Check browser console for errors
2. Verify all files are loaded (F12 Network tab)
3. Check data in localStorage
4. Test with sample data first
